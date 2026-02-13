import { invoke } from "@tauri-apps/api/core";

import { delay } from "@utils/generalUtils";
import {
   findFirstLoadBankFrame,
   buildLoadBankFrame,
   lbWriteBytes,
   waitForLoadBankMask,
   getLastLoadBankStatus,
} from "./lbProtocol";

import type { InterlockState } from "@/types/generalTypes"; 
import type { Roundtrip, LoadBankProbe, LoadBankStatus } from "@/types/loadBankTypes";
import { DEV_ECHO_BAUD, DEV_ECHO_DELAY } from "@/dev/devConfig";







// ───────────────────────────────────────────────────────────────────────────────
// LoadBank Probe
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Scans all COM ports.
 * Returns Probe { connected, hw_id, serial, portName? }.
 */
export async function detectLoadBank(): Promise<LoadBankProbe> {
   console.log("[LB/HW] Probing load bank...");

   // If runtime was running, stop it before debug probing (safe best-effort)
   await invoke("lb_stop_polling").catch(() => {});

   const ports = await invoke<string[]>("list_ports");
   console.log("[LB/HW] Available ports:", ports);
   const baud = DEV_ECHO_BAUD;

   for (const portName of ports) {
      try {
         await invoke("connect", { portName, baud });

         // Ask Tauri to just listen (no TX) for a short window.
         const roundtrip = await invoke<Roundtrip>("test_roundtrip_bytes", { 
            data: [],  // Serve de handshake?
            durationMs: DEV_ECHO_DELAY
         });

         await invoke("close").catch(() => {}); // todo: remove?

         const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
         if (!match) {
            console.debug("[LB/HW] No valid LB frame on", portName);
            continue;
         }


         const parsed = match.parsed;
         const status: LoadBankStatus = { ...parsed, portName };

         console.log("[LB/HW] Load bank detected on", portName, status);

         return {
            connected: true,
            portName,
            status,
            bank_power: parsed.bankPower,
            bank_no: parsed.bankNo,
         };

      } catch (err) {
         //try { await invoke("close"); } catch { /* ignore */ }
         console.warn("[LB/HW] Error probing port",portName,"-", err);
         await invoke("close").catch(() => {});
      }
   }

   console.warn("[LB/HW] No load bank detected on any port");
   return { connected: false };
}










// ───────────────────────────────────────────────────────────────────────────────
// Initialize contactor via frame data 
// ───────────────────────────────────────────────────────────────────────────────
export async function setLoadBankContactors(opts: {
   portName: string;
   //baud?: number;
   lastStatus: LoadBankStatus; // to reuse version / bankPower / bankNo
   contactorsMask: number;
   timeoutMs?: number;
}): Promise<LoadBankStatus> {
   //if (!opts.baud) opts.baud = 115200; // optional assertion
   const { portName, lastStatus, contactorsMask } = opts; // baud, 
   console.log("[LB/HW] setLoadBankContactors", {
      portName,
      lastStatus,
      contactorsMask: `0x${contactorsMask.toString(16)}`,
   });

   // Build a frame using the last known fields
   const txFrame = buildLoadBankFrame({
      version: lastStatus.version,
      bankPower: lastStatus.bankPower,
      bankNo: lastStatus.bankNo,

      // Send 0 in the error fields; the bank provides true vals
      contactorsMask,
      errContactors: 0,
      errFans: 0,
      errThermals: 0,
      otherErrors: 0,
   });
   console.log("[LB/HW] setLoadBankContactors/buildLoadBankFrame", txFrame);

   // write through runtime (NOT debug roundtrip)
   await lbWriteBytes(txFrame);

   // wait until polling stream confirms the mask
   const confirmed = await waitForLoadBankMask(portName, contactorsMask, {
      timeoutMs: opts.timeoutMs ?? 2000,
   });

   // prefer confirmed status (already newest) - keep fallback
   return confirmed ?? getLastLoadBankStatus(portName)!;// ?? confirmed;
}



// ───────────────────────────────────────────────────────────────────────────────
// Contactor comms
// ───────────────────────────────────────────────────────────────────────────────
/** 
 * Safely apply a new contactor mask by turning all off, then on. 
 * */
export async function applyLoadBankMaskSequence(opts: {
   portName: string;
   currentStatus: LoadBankStatus;
   targetMask: number;
}): Promise<LoadBankStatus> {
   const { portName, currentStatus, targetMask } = opts;
   // turn all contactors OFF
   const offStatus = await setLoadBankContactors({
      portName,
      lastStatus: currentStatus,
      contactorsMask: 0x0000,
   });
   // (Optionally notify UI about offStatus here if needed for immediate feedback)
   // turn ON contactors for target mask
   try {
      const newStatus = await setLoadBankContactors({
         portName,
         lastStatus: offStatus,
         contactorsMask: targetMask,
      });
      return newStatus;
   } catch (err) {
      console.error("[LoadBank] Failed to apply mask 0x%s on %s: %o", 
                  targetMask.toString(16), portName, err);
      // ensure all contactors off if the second step failed
      try {
         await setLoadBankContactors({
            portName,
            lastStatus: offStatus,
            contactorsMask: 0x0000,
            timeoutMs: 1200,
         });
      } catch { /* ignore errors in fallback */ }
      throw err;
   }
}


// ───────────────────────────────────────────────────────────────────────────────
// Check LB Status -- DEBUG
// ───────────────────────────────────────────────────────────────────────────────
export async function readLoadBankStatusOnce(portName: string, baud = DEV_ECHO_BAUD): Promise<LoadBankStatus | null> {
   await invoke("lb_stop_polling").catch(() => {}); // avoid port fight

   await invoke("connect", { portName, baud });
   const roundtrip = await invoke<Roundtrip>("test_roundtrip_bytes", { data: [], durationMs: DEV_ECHO_DELAY });
   await invoke("close").catch(() => {});

   const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
   if (!match) return null;

   return { ...match.parsed, portName };
}











// ───────────────────────────────────────────────────────────────────────────────
// Signals bus — interlocks + simple measurements
// ───────────────────────────────────────────────────────────────────────────────
export type Signals = {
   getInterlocks(): Promise<InterlockState>;
   subscribeInterlocks(cb: (s: InterlockState) => void): () => void;
   measureOCV(): Promise<{ voltage: number }>;
   // stream API - high-rate logging
};

class SignalsClass implements Signals {
   private state: InterlockState = {
      enclosureClosed: true,
      eStopReleased: true,
      gasOk: true,
      coolantOk: true,
      mainsOk: true,
      polarityContinuity: 'ok',
   };
   private listeners = new Set<(s: InterlockState) => void>();
   private tick?: number;

   private emit() {
      for (const fn of this.listeners) fn(this.state);
   }

   //async getInterlocks() { return this.state; }
   async getInterlocks(): Promise<InterlockState> {
      return this.state;
   }

    /** Subscribe to interlock updates; returns unsubscribe. */
   subscribeInterlocks(cb: (s: InterlockState) => void): () => void {
      this.listeners.add(cb);
      cb(this.state); // push current immediately

      // optional: drive a heartbeat so consumers see "live" updates in dev
      if (!this.tick) {
         this.tick = window.setInterval(() => this.emit(), 1000);
      }

      return () => {
         this.listeners.delete(cb);
         if (this.listeners.size === 0 && this.tick) {
            clearInterval(this.tick);
            this.tick = undefined;
         }
      };
   }
   /** Stub measurement: around ~80V with small noise. */
   async measureOCV(): Promise<{ voltage: number }> {
      await delay(120);
      const noise = (Math.random() - 0.5) * 2.0; // ±1.0 V
      return { voltage: 80 + noise };
   }

   // DEV ONLY: allow test code to tweak the stubbed state (not used by steps directly)
   /*
   setState(patch: Partial<InterlockState>) {
      this.state = { ...this.state, ...patch };
      this.emit();
   }
   */
}

export const signals: Signals = new SignalsClass();






// ───────────────────────────────────────────────────────────────────────────────
// Utility: poll a boolean producer until timeout
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Poll an async predicate until it returns true or timeout elapses.
 * @param read     async function returning a boolean
 * @param cfg      { timeoutMs = 10_000, pollMs = 150 }
 * @returns        true if condition met before timeout, else false
 */
export async function waitForSignal(
   read: () => Promise<boolean>,
   cfg: { timeoutMs?: number; pollMs?: number } = {}
): Promise<boolean> {
   const timeoutMs = cfg.timeoutMs ?? 10_000;
   const pollMs = cfg.pollMs ?? 150;
   const start = Date.now();
   while (Date.now() - start < timeoutMs) {
      if (await read()) return true;
      await delay(pollMs);
   }
   return false;
}






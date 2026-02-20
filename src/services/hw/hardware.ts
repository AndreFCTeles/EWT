import { invoke } from "@tauri-apps/api/core";

import { delay } from "@utils/generalUtils";
import {
   //findFirstLoadBankFrame,
   buildLoadBankFrame,
   lbSetPolling, 
   lbWriteBytes,
   waitForLoadBankMask,
   getLastLoadBankStatus,
   startLoadBankPolling
} from "./lbProtocol";

import type { InterlockState } from "@/types/generalTypes"; 
import type { 
   //Roundtrip, 
   LoadBankProbe, 
   LoadBankStatus, 
   LoadBankHealth, 
   SerialPortInfo 
} from "@/types/loadBankTypes";
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

   const portInfo = await invoke<SerialPortInfo[]>("list_ports_detailed");
   const ports = portInfo.map((p) => p.portName as string);
   /*
   const ports = portInfo.length
      ? portInfo.map((p) => p.portName as string)
      : await invoke<string[]>("list_ports");
   */
   console.log("[LB/HW] Available ports:", ports);
   const baud = DEV_ECHO_BAUD;

   for (const portName of ports) {
      try {
         const status = await probePortForStatus(portName, baud, DEV_ECHO_DELAY);
         if (!status) continue;

         console.log("[LB/HW] Load bank detected on", portName, status);

         return {
            connected: true,
            portName,
            status,
            bank_power: status.bankPower,
            bank_no: status.bankNo,
            bank_health: status.bankHealth
         };

      } catch (err) {
         console.warn("[LB/HW] Error probing port", portName,"-", err);
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

      bankHealth: lastStatus.bankHealth,

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
   const status = await probePortForStatus(portName, baud, DEV_ECHO_DELAY);
   if (!status) return null;

   return { ...status, portName };
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









// ───────────────────────────────────────────────────────────────────────────────
// Utility: poll and wait for status
// ───────────────────────────────────────────────────────────────────────────────


async function probePortForStatus(
   portName: string,
   baud: number,
   timeoutMs = 400
): Promise<LoadBankStatus | null> {
   const ac = new AbortController();

   // This stop() only unsubscribes *this* probe; runtime stops only if nobody is listening.
   let stop: (() => Promise<void>) | null = null;

   try {
      let resolveStatus!: (v: LoadBankStatus | null) => void;
      const statusPromise = new Promise<LoadBankStatus | null>((resolve) => {
         resolveStatus = resolve;
      });

      const timer = window.setTimeout(() => resolveStatus(null), timeoutMs);

      // Make sure we have stop() before we start waiting (avoids races).
      stop = await startLoadBankPolling(
         portName,
         (s) => {
            clearTimeout(timer);
            resolveStatus(s);
         },
         baud,
         ac.signal,
         (_h: LoadBankHealth) => {}
      );

      // Optional: enable a lightweight poll frame during probing.
      // If your device streams statuses autonomously, you can remove this.
      try {
         const probeFrame = buildLoadBankFrame({
         version: 1,
         bankPower: 600,
         bankNo: 1,
         bankHealth: 0,
         contactorsMask: 0,
         errContactors: 0,
         errFans: 0,
         errThermals: 0,
         otherErrors: 0,
         });
         await lbSetPolling(true, 150, probeFrame);
      } catch {
         // ignore (probing can still work if device streams by itself)
      }

      return await statusPromise;
   } finally {
      ac.abort();
      try {
         await lbSetPolling(false, 200, new Uint8Array());
      } catch {
         // ignore
      }
      if (stop) await stop().catch(() => {});
   }
}


/*
async function probePortForStatus(
   portName: string, 
   baud: number, 
   timeoutMs = 400
): Promise<LoadBankStatus | null> {
   const ac = new AbortController();
*/

   // OLD
   /*
   let stop: null | (() => Promise<void>) = null;

   try {
      const status = await new Promise<LoadBankStatus | null>((resolve) => {
         const timer = window.setTimeout(() => resolve(null), timeoutMs);

         startLoadBankPolling(
            portName,
            (s) => { 
               clearTimeout(timer); 
               resolve(s); },
            baud,
            ac.signal,
            (_h: LoadBankHealth) => {}
         ).then((fn) => { stop = fn; });
      });

      return status;
   } finally {
      ac.abort();
      if (stop) await stop().catch(() => {});
   }
      */

   
   // NEW
   /*
   let timer: number | undefined;

   // Resolve on first status or timeout
   let resolve!: (v: LoadBankStatus | null) => void;
   const p = new Promise<LoadBankStatus | null>((r) => (resolve = r));

   const onStatus = (s: LoadBankStatus) => {
      if (timer) window.clearTimeout(timer);
      resolve(s);
   };

   // Start polling and immediately get stop handle (no race condition)
   const stop = await startLoadBankPolling(
      portName,
      onStatus,
      baud,
      ac.signal,
      (_h: LoadBankHealth) => {}
   );

   // Arm timeout after subscription is active
   timer = window.setTimeout(() => resolve(null), timeoutMs);

   try {
      return await p;
   } finally {
      if (timer) window.clearTimeout(timer);
      ac.abort(); // triggers stop too, but we also call stop() explicitly to be deterministic AND PEDANTIC also quite annoying
      await stop().catch(() => {});
   }
}
   */
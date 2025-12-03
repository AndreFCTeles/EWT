import { invoke } from "@tauri-apps/api/core";

import { delay } from "./generalUtils";
import { findFirstLoadBankFrame, buildLoadBankFrame } from "./lbProtocol";
//import type { LoadBankFrame, LoadBankStatus } from "./lbProtocol";

import type { InterlockState } from "@/types/generalTypes"; // DB_HOST
import type { Roundtrip, LoadBankProbe, LoadBankStatus } from "@/types/commTypes";







function toHex(bytes: number[]): string {
   return bytes.map(b => b
      .toString(16)
      .toUpperCase()
      .padStart(2, "0")
   ).join(" ");
}







// ───────────────────────────────────────────────────────────────────────────────
// LoadBank Probe
// ───────────────────────────────────────────────────────────────────────────────
/**
 * Scans all COM ports.
 * Returns Probe { connected, hw_id, serial, portName? }.
 * Runs on startup
 */
export async function probeConnectedLB(): Promise<LoadBankProbe> {
   console.log("[LB/HW] Probing load bank...");
   const ports = await invoke<string[]>("list_ports");
   console.log("[LB/HW] Available ports:", ports);
   const baud = 115200;

   for (const portName of ports) {
      try {
         await invoke("connect", { portName, baud });

         // Ask Tauri to just listen (no TX) for a short window.
         const roundtrip = await invoke<Roundtrip>("test_roundtrip_bytes", { 
            data: [], 
            durationMs: 500 
         });

         await invoke("close").catch(() => {});

         const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
         if (!match) {
            console.debug("[LB/HW] No valid LB frame on", portName);
            continue;
         }

         //const { parsed } = match;

         /* Map to your Probe type; adapt if Probe has more fields.
         return {
            connected: true,
            hwId: `LB-${parsed.bankPower}-${parsed.bankNo}`,
            serial: `LB-${parsed.bankNo}`,
            portName,
         } as Probe;
         */



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
      }
   }

   console.warn("[LB/HW] No load bank detected on any port");
   return { connected: false };
}


export async function setLoadBankContactors(opts: {
   portName: string;
   //baud?: number;
   lastStatus: LoadBankStatus; // to reuse version / bankPower / bankNo
   contactorsMask: number;     // 16-bit mask, C1..C16
}): Promise<LoadBankStatus> {
   //if (!opts.baud) opts.baud = 115200;
   const { portName, lastStatus, contactorsMask } = opts; //baud
   console.log("[LB/HW] setLoadBankContactors", {
      portName,
      contactorsMask: `0x${contactorsMask.toString(16)}`,
   });

   // Build a frame using the last known meta-fields
   const txFrame = buildLoadBankFrame({
      version: lastStatus.version,
      bankPower: lastStatus.bankPower,
      bankNo: lastStatus.bankNo,
      contactorsMask: contactorsMask,

      // Send 0 in the error fields; the bank will fill them in its reply.
      errContactors: 0,
      errFans: 0,
      errThermals: 0,
      otherErrors: 0,
   });

   //await invoke("connect", { portName: portName, baud });

   const roundtrip = await invoke<Roundtrip>("test_roundtrip_bytes", {
      data: Array.from(txFrame),
      durationMs: 200,
   });
   
   console.debug("[LB/HW] Command sent_bytes:", roundtrip.sent_bytes);
   console.debug("[LB/HW] Command recv_bytes:", roundtrip.recv_bytes);

   //await invoke("close").catch(() => {});

   const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
   if (!match) {
      console.error("[LB/HW] No valid reply after setting contactors");
      throw new Error("Load bank did not respond with a valid frame after contactor command");
   }

   /*
   const { raw, parsed } = match;

   return {
      ...parsed,
      portName: opts.portName,
      rawFrameHex: toHex(Array.from(raw)),
   };
   */

   const parsed = match.parsed;
   const status: LoadBankStatus = { ...parsed, portName };

   if (status.errContactors || status.errFans || status.errThermals || status.otherErrors) {
      console.warn("[LB/HW] Load bank reported errors after command", status);
   } else {
      console.log("[LB/HW] Load bank status OK after command");
   }

   return status;
}


export async function readLoadBankStatusOnce(portName: string, baud = 115200): Promise<LoadBankStatus | null> {
   await invoke("connect", { portName, baud });
   const roundtrip = await invoke<Roundtrip>("test_roundtrip_bytes", { data: [], durationMs: 300 });
   await invoke("close").catch(() => {});

   const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
   if (!match) return null;

   const { raw, parsed } = match;
   return {
      ...parsed,
      portName,
      rawFrameHex: toHex(Array.from(raw)),
   };
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
   setState(patch: Partial<InterlockState>) {
      this.state = { ...this.state, ...patch };
      this.emit();
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






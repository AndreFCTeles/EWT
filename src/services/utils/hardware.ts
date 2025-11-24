import { invoke } from "@tauri-apps/api/core";

import { delay } from "./generalUtils";
import { findFirstLoadBankFrame, buildLoadBankFrame } from "./lbProtocol";
import type { LoadBankFrame, LoadBankStatus } from "./lbProtocol";

import type { InterlockState, Probe } from "@/types/generalTypes"; // DB_HOST








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
 * Try to find a load bank on any available COM port.
 * Returns Probe { connected, hwId, serial, portName? }.
 */
export async function probeConnectedLB(): Promise<Probe> {
   const ports = await invoke<string[]>("list_ports");
   const defaultBaud = 115200;

   for (const portName of ports) {
      try {
         await invoke("connect", { portName, defaultBaud });

         // Ask Tauri to just listen (no TX) for a short window.
         const roundtrip = await invoke<{
            sent_bytes: number[];
            recv_bytes: number[];
            sent_hex: string;
            recv_hex: string;
         }>("test_roundtrip_bytes", { data: [], durationMs: 500 });

         await invoke("close").catch(() => {});

         const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
         if (!match) continue;

         const { parsed } = match;

         // Map to your Probe type; adapt if Probe has more fields.
         return {
            connected: true,
            hwId: `LB-${parsed.bankPower}-${parsed.bankNo}`,
            serial: `LB-${parsed.bankNo}`,
            portName,
         } as Probe;
      } catch {
         // Ignore this port, carry on
         try { await invoke("close"); } catch { /* ignore */ }
      }
   }

   return { connected: false } as Probe;
}


export async function setLoadBankContactors(opts: {
   portName: string;
   baud?: number;
   lastStatus: LoadBankFrame; // to reuse version / bankPower / bankNo
   contactorsMask: number;     // 16-bit mask, C1..C16
}): Promise<LoadBankStatus> {
   const baud = opts.baud ?? 115200;

   // Build a frame using the last known meta-fields
   const txFrame = buildLoadBankFrame({
      version: opts.lastStatus.version,
      bankPower: opts.lastStatus.bankPower,
      bankNo: opts.lastStatus.bankNo,
      contactorsMask: opts.contactorsMask,

      // Send 0 in the error fields; the bank will fill them in its reply.
      errContactors: 0,
      errFans: 0,
      errThermals: 0,
      otherErrors: 0,
   });

   await invoke("connect", { portName: opts.portName, baud });

   const roundtrip = await invoke<{
      sent_bytes: number[];
      recv_bytes: number[];
      sent_hex: string;
      recv_hex: string;
   }>("test_roundtrip_bytes", {
      data: Array.from(txFrame),
      durationMs: 500,
   });

   await invoke("close").catch(() => {});

   const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
   if (!match) {
      throw new Error("Load bank did not respond with a valid frame after contactor command");
   }

   const { raw, parsed } = match;

   return {
      ...parsed,
      portName: opts.portName,
      rawFrameHex: toHex(Array.from(raw)),
   };
}


export async function readLoadBankStatusOnce(portName: string, baud = 115200): Promise<LoadBankStatus | null> {
   await invoke("connect", { portName, baud });
   const roundtrip = await invoke<{
      sent_bytes: number[];
      recv_bytes: number[];
      sent_hex: string;
      recv_hex: string;
   }>("test_roundtrip_bytes", { data: [], durationMs: 300 });
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






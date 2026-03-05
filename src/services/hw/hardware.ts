import { delay } from "@utils/generalUtils";
import type { InterlockState } from "@/types/generalTypes";
import type { LoadBankStatus } from "@/types/loadBankTypes";
import {
   lbSetContactors,
   waitForLoadBankMask,
   getLastLoadBankStatus,
} from "./lbProtocol";

// -----------------------------------------------------------------------------
// Load bank commands (frontend sends intent; backend builds/sends frames)
// -----------------------------------------------------------------------------

export async function setLoadBankContactors(opts: {
   portName: string; // kept for call sites; backend owns actual port
   lastStatus: LoadBankStatus; // kept for call sites; backend uses its last status
   contactorsMask: number;
   timeoutMs?: number;
}): Promise<LoadBankStatus> {
   const { contactorsMask } = opts;
   await lbSetContactors(contactorsMask);
   // confirmation comes from status stream
   return await waitForLoadBankMask(contactorsMask, { timeoutMs: opts.timeoutMs ?? 2000 });
}

/** Safely apply a new contactor mask by turning all off, then on. */
export async function applyLoadBankMaskSequence(opts: {
   portName: string;
   currentStatus: LoadBankStatus;
   targetMask: number;
}): Promise<LoadBankStatus> {
   const { portName, currentStatus, targetMask } = opts;

   const offStatus = await setLoadBankContactors({
      portName,
      lastStatus: currentStatus,
      contactorsMask: 0x0000,
   });

   try {
      return await setLoadBankContactors({
         portName,
         lastStatus: offStatus,
         contactorsMask: targetMask,
      });
   } catch (err) {
      // fallback: ensure OFF
      try {
         await setLoadBankContactors({
            portName,
            lastStatus: offStatus,
            contactorsMask: 0x0000,
            timeoutMs: 1200,
         });
      } catch {
         /* ignore */
      }
      throw err;
   }
}

export function getCurrentLoadBankStatus(): LoadBankStatus | null {
   return getLastLoadBankStatus();
}

// -----------------------------------------------------------------------------
// Signals bus — interlocks + simple measurements (unchanged)
// -----------------------------------------------------------------------------

export type Signals = {
   getInterlocks(): Promise<InterlockState>;
   subscribeInterlocks(cb: (s: InterlockState) => void): () => void;
   measureOCV(): Promise<{ voltage: number }>;
};

class SignalsClass implements Signals {
   private state: InterlockState = {
      enclosureClosed: true,
      eStopReleased: true,
      gasOk: true,
      coolantOk: true,
      mainsOk: true,
      polarityContinuity: "ok",
   };
   private listeners = new Set<(s: InterlockState) => void>();
   private tick?: number;

   private emit() {
      for (const fn of this.listeners) fn(this.state);
   }

   async getInterlocks(): Promise<InterlockState> {
      return this.state;
   }

   subscribeInterlocks(cb: (s: InterlockState) => void): () => void {
      this.listeners.add(cb);
      cb(this.state);

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

   async measureOCV(): Promise<{ voltage: number }> {
      await delay(120);
      const noise = (Math.random() - 0.5) * 2.0;
      return { voltage: 80 + noise };
   }
}

export const signals: Signals = new SignalsClass();

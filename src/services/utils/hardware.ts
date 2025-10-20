import type { InterlockState, Probe } from "@/types/generalTypes"; // DB_HOST,
import type { ProductData } from "@/types/productTypes";
import { delay } from "./generalUtils";


// dev
import { DEV_STUB_CONNECTED, DEV_STUB_DB_MATCH } from "@/dev/devConfig";











// ───────────────────────────────────────────────────────────────────────────────
// DUT probe & DB lookup
// ───────────────────────────────────────────────────────────────────────────────

/** Probe the controller to see if a DUT is connected (stub for now). */
export async function probeConnectedDut(): Promise<Probe> {
   await delay(200);
   // flip these while testing flows
   
   return DEV_STUB_CONNECTED
      ? { 
         connected: true, 
         hwId: 'HW-EX-600', 
         serial: 'SN-0001' 
      } : { 
         connected: false 
      };
}


/** Look up a Product by hardware ID (stub DB; align category root to 'maq'). */
export async function lookupProductByHwId(hwId: string): Promise<ProductData | null> {
   void hwId;
   await delay(150);
   if (!DEV_STUB_DB_MATCH) return null;
   return {
      prodName: 'MIG 604 CW',
      brand: 'Electrex',
      series: '4',
      category: { 
         main: 'maq', 
         sub: { 
            main: 'maq-mig', 
            format: 'maq-mig-f-com', 
            sub: { 
               main: 'maq-mig-bas' 
            } 
         } 
      },
      technical: [{ 
         field: 'Corrente nominal', 
         value: '600', 
         suf: 'A' 
      }],
      description: '', 
      applications: '', 
      functions: [], 
      images: [],
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

   /*
   subscribeInterlocks(cb: (s: InterlockState) => void) {
      this.listeners.add(cb);
      cb(this.state);
      return () => this.listeners.delete(cb);
   }
   async measureOCV() { return { voltage: 78.9 }; }
   */

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
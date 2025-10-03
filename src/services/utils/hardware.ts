import { InterlockState, Probe } from "@/types/generalTypes"; // DB_HOST,
import { ProductData } from "@/types/productTypes";
import { delay } from "./generalUtils";
import dayjs from '@/lib/dayjs-setup';



// ---- STUBS ----
//const STUB_CONNECTED = true;   // set false to simulate “not connected”
const STUB_DB_MATCH  = true;   // set false to simulate “not in DB”





/*
export async function probeConnectedDut(): Promise<Probe> {
   await delay(200);
   return STUB_CONNECTED
      ? { connected: true, hwId: 'HW-EX-600', serial: 'SN-0001' }
      : { connected: false };
}
*/

/** Probe the controller to see if a DUT is connected. */
export async function probeConnectedDut(): Promise<Probe> {
   await delay(200);
   // flip these while testing flows
   return { connected: true, hwId: 'HW-EX-600', serial: 'SN-0001' };
}



export async function lookupDutByHwId(hwId: string): Promise<ProductData | null> {
   void hwId;
   await delay(150);
   if (!STUB_DB_MATCH) return null;
   return {
      prodName: 'MIG 600A DB',
      brand: 'Electrex',
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

   async getInterlocks() { return this.state; }
   subscribeInterlocks(cb: (s: InterlockState) => void) {
      this.listeners.add(cb);
      cb(this.state);
      return () => this.listeners.delete(cb);
   }
   async measureOCV() { return { voltage: 78.9 }; }
}

export const signals: Signals = new SignalsClass();



export async function waitForSignal(
   read: () => Promise<boolean>,
   cfg: { timeoutMs?: number; pollMs?: number } = {}
): Promise<boolean> {
   console.log('Date.now()');
   console.log(Date.now());
   console.log('dayjs()');
   console.log(dayjs());
   const timeoutMs = cfg.timeoutMs ?? 10_000;
   const pollMs = cfg.pollMs ?? 150;
   const start = Date.now();
   while (Date.now() - start < timeoutMs) {
      if (await read()) return true;
      await delay(pollMs);
   }
   return false;
}
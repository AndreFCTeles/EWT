//import type { AvailablePowers, Processes } from "../generalTypes";
import type { ProductData } from "../productTypes";
import delay from "./delay";

export type Probe = {
   connected: boolean;
   hwId?: string;
   serial?: string;
}

/*
export type DbDut = {
   id?: any;
   model: string;
   serial?: string;
   brand: string;
   processes: Processes[];
   ratedCurrent: AvailablePowers;
}
*/


// ---- STUBS ----
const STUB_CONNECTED = true;   // set false to simulate “not connected”
const STUB_DB_MATCH  = true;   // set false to simulate “not in DB”


export async function probeConnectedDut(): Promise<Probe> {
   await delay(200);
   return STUB_CONNECTED
      ? { connected: true, hwId: 'HW-EX-600', serial: 'SN-0001' }
      : { connected: false };
}



export async function lookupDutByHwId(hwId: string): Promise<ProductData | null> {
   await delay(150);
   if (!STUB_DB_MATCH) return null;
   return {
      prodName: 'MIG 600A DB',
      brand: 'Electrex',
      category: { main: 'maq', sub: { main: 'maq-mig', format: 'maq-mig-f-com', sub: { main: 'maq-mig-bas' } } },
      technical: [{ field: 'Corrente nominal', value: '600', suf: 'A' }],
      description: '', applications: '', functions: [], images: [],
   };
}
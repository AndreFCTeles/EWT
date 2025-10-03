import { AvailablePowers, Processes } from "@/services/generalTypes";
import { ProductData } from "@/services/productTypes";
import type { DeviceOrigin } from "@/services/generalTypes";
//import type { DutRuntime } from "@/services/utils/dutRuntime";



export type ProductDoc = {
   _id?: { $oid: string };
   prodName: string;
   brand: string;
   series?: string;
   category: {
      main: string;
      sub?: {
         main: string;
         format?: string;
         sub?: { main: string };
      };
      format?: string;
   };
   technical: Array<{ 
      field: string; 
      value: string; 
      suf?: string 
   }>;
   applications?: string;
   description?: string;
   functions: any[];
   images: any[];
   createdDate?: string;
   updatedDate?: string;
};


export type Dut = {
   prodName: string;
   brand: string;
   series?: string;
   serialno?: string;
   processes: Processes[];
   ratedCurrent?: AvailablePowers; // optional; we’ll fill if we can
   format?: string;              // derived from category.format or top-level format
   origin: DeviceOrigin;
};

/*
export type DutRuntime = {
   prodName: string;
   brand: string;
   series?: string;
   processes: Processes[];
   ratedCurrent?: AvailablePowers;
   origin: DeviceOrigin;
};
*/



export type StepId =
   | 'login' | 'specs'
   | 'dut' | 'detectDut'
   | 'pickProcess' | 'pickPower' | 'pickBrand'
   | 'interlocks' | 'connections' | 'selftests' | 'calstatus'
   | 'ocv'
   | `proc:${Processes}:nominals`
   | `proc:${Processes}:start`
   | `proc:${Processes}:sweep`
   | `proc:${Processes}:thermal`
   | `proc:${'MIG' | 'TIG'}:pulse`
   | `proc:${'MIG' | 'TIG'}:gas`
   | 'summary' | 'export';

export type Verdict = 'pass' | 'warn' | 'fail' | 'skipped';

export type StepRecord = {
   id: StepId;
   startedAt: string; 
   endedAt: string;
   inputs?: Record<string, unknown>;
   commanded?: Record<string, unknown>;
   measured?: Record<string, number>;
   toleranceUsed?: unknown; // Tol shape
   verdict: Verdict;
   notes?: string[];
};

export type Submission = {
   header: { 
      operator: string; 
      station: string; 
      appVer: string; 
      templateVer: string; 
   };
   dut: Dut;
   /*{ // device under test
      model?: string; 
      serial?: string; 
      brand: string;
      processes: Array<Processes>; 
      ratedCurrent?: AvailablePowers;
      firmware?: string; 
      origin?: DeviceOrigin; 
   };*/
   instruments: { 
      meterId: string; 
      meterCal: string; 
      lbId: string; 
      lbFw?: string; 
   };
   env?: { 
      ambientC?: number; 
      mainsV?: number 
   };
   steps: StepRecord[];
   //vars?: Record<string, any>;
   vars?: {
      manualSelect?: boolean;         // set true if auto-detect failed
      selectedProcess?: Processes;
      powerA?: AvailablePowers;
      brand?: string;
      productData?: ProductData;
      dutPatchedManual?: boolean;
      [k: string]: any;
   };
   finalVerdict?: Verdict;
   reportId?: string;
};


export const PIPELINE: StepId[] = [
   'login', 'specs',
   'dut', 'detectDut', 
   'pickProcess', 'pickPower', 'pickBrand',
   'interlocks', 'connections', 'selftests', 'calstatus',
   'ocv',
   'proc:MIG:nominals', 'proc:MIG:start', 'proc:MIG:sweep', 'proc:MIG:pulse', 'proc:MIG:thermal', 'proc:MIG:gas',
   'proc:TIG:nominals', 'proc:TIG:start', 'proc:TIG:sweep', 'proc:TIG:pulse', 'proc:TIG:thermal', 'proc:TIG:gas',
   'proc:MMA:nominals', 'proc:MMA:start', 'proc:MMA:sweep', 'proc:MMA:thermal',
   'summary', 'export'
];

export const SKIP: (s: Submission) => Partial<Record<StepId, boolean>> = (s) => ({
   // Skip whole process groups if DUT doesn’t claim them
   'proc:MIG:nominals': !s.dut.processes.includes('MIG'),
   'proc:MIG:start': !s.dut.processes.includes('MIG'),
   'proc:MIG:sweep': !s.dut.processes.includes('MIG'),
   'proc:MIG:pulse': !s.dut.processes.includes('MIG'), // or only if MIG has pulse in spec
   'proc:MIG:thermal': !s.dut.processes.includes('MIG'),
   'proc:MIG:gas': !s.dut.processes.includes('MIG'),

   'proc:TIG:gas': /* maybe TIG gas only if spec says gas present */ false,

   // Skip VRD check if model has no VRD (handled inside OCV step or with a separate step)
   // Skip “pulse” where model lacks pulse mode, etc.
});

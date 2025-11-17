import type { RatedCurrent, Process, DeviceOrigin } from "./protocolTypes";
import type { ProductData } from "./productTypes";


export type Verdict = 
'pass' | 'warn' | 'fail' | 'skipped' | 
'OK' | 'aviso' | 'falhou' | 'ignorado' | '-' | 'N/A';

export type Polarity = 'ok' | 'reversed' | 'open' | 'unknown';

export type ProductDoc = {
   _id?: { $oid: string };
   prodName: string;
   brand: string;
   series?: string;
   serialno?: string;
   category: {
      main: string;
      sub?: {
         main: string;
         format?: string;
         sub?: { 
            main: string 
         };
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
   processes: Process[];
   ratedCurrent?: RatedCurrent;
   format?: string;
   origin: DeviceOrigin;
};



export type StepId =
   'detectPowerBank' | 'pickProcedure' 
   | 'specs' | 'dut' | 'detectDut'
   | 'pickProcess' | 'pickPower' | 'pickBrand'
   | 'interlocks' | 'connections' | 'selftests' | 'calstatus'
   | 'ocv'
   | `proc:${Process}:nominals`
   | `proc:${Process}:start`
   | `proc:${Process}:sweep`
   | `proc:${Process}:thermal`
   | `proc:${'MIG' | 'TIG'}:pulse`
   | `proc:${'MIG' | 'TIG'}:gas`
   | 'summary' | 'export';

export const PIPELINE: StepId[] = [
   'detectPowerBank', 'pickProcedure',
   'specs', 'dut', 'detectDut', 
   'pickProcess', 'pickPower', 'pickBrand',
   'interlocks', 'connections', 'selftests', 'calstatus',
   'ocv',
   'proc:MIG:nominals', 'proc:MIG:start', 'proc:MIG:sweep', 'proc:MIG:pulse', 'proc:MIG:thermal', 'proc:MIG:gas',
   'proc:TIG:nominals', 'proc:TIG:start', 'proc:TIG:sweep', 'proc:TIG:pulse', 'proc:TIG:thermal', 'proc:TIG:gas',
   'proc:MMA:nominals', 'proc:MMA:start', 'proc:MMA:sweep', 'proc:MMA:thermal',
   'summary', 'export'
];


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
   dut?: Dut;
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
   vars?: {
      manualSelect?: boolean;
      selectedProcess?: Process;
      powerA?: RatedCurrent;
      brand?: string;
      productData?: ProductData;
      dutPatchedManual?: boolean;
      [k: string]: any;
   };
   finalVerdict?: Verdict;
   reportId?: string;
};
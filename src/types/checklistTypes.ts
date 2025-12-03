import type { FuncData, ProdCategory, ProductData, TechnicalData } from "./productTypes";
import type { Tol } from "./generalTypes";





//GENERAL
export type Process = 'MMA'|'TIG'|'MIGInv'|'MIGConv';
export const PROCESSES: Process[] = ['MMA', 'TIG', 'MIGInv', 'MIGConv'];
export type RatedCurrent = 300|350|400|500|600|1000;
export const POWERS: RatedCurrent[] = [300, 350, 400, 500, 600, 1000];
export type DeviceOrigin = 'db'|'manual'|'autodetect';
export type Unit = 'V'|'A'|'Ω'|'°C'|'mV'|'mA'|'kΩ'|'%';
export type Polarity = 'ok' | 'reversed' | 'open' | 'unknown';

export type Verdict = 
   'pass' | 'warn' | 'fail' | 'skipped' | 
   'OK' | 'aviso' | 'falhou' | 'ignorado' | '-' | 'N/A';




// STEPS
export type StepId =
   'detectPowerBank' | 'pickProcedure' 
   | 'specs' | 'dutSearch'
   | 'pickProcess' | 'pickPower' | 'pickBrand'
   | 'dut' | 'interlocks' | 'connections' | 'selftests' | 'calstatus'
   | 'calibration' | 'ocv'
   | `proc:${Process}:nominals`
   | `proc:${Process}:start`
   | `proc:${Process}:sweep`
   | `proc:${Process}:thermal`
   | `proc:${'MIGInv' | 'TIG'}:pulse`
   | `proc:${'MIGInv' | 'TIG'}:gas`
   | 'summary' | 'export';

export const PIPELINE: StepId[] = [ // ordem
   'detectPowerBank', 'pickProcedure',
   'specs', 'dutSearch',
   'pickProcess', 'pickPower', 'pickBrand',
   'dut', 'interlocks', 'connections', 'selftests', 'calstatus',
   'calibration','ocv',
   'proc:MIGInv:nominals', 'proc:MIGInv:start', 'proc:MIGInv:sweep', 'proc:MIGInv:pulse', 'proc:MIGInv:thermal', 'proc:MIGInv:gas',
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
   toleranceUsed?: Tol; // Tol shape - Ou usar SimpleTest de calTypes.ts?
   verdict: Verdict;
   notes?: string[];
};








//REPORT
export type ProductDoc = {
   _id?: string ;
   prodName: string;
   brand: string;
   series?: string;
   serialno?: string;
   category: ProdCategory;
   format?: ProdCategory;
   technical?: TechnicalData[];
   applications?: string;
   description?: string;
   functions?: FuncData[];
   images?: ImageData[];
   createdDate?: string;
   updatedDate?: string;
};

/* old 
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
*/


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
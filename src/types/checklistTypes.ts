import type { FuncData, ProdCategory, ProductData, TechnicalData } from "./productTypes";
import type { Tol } from "./generalTypes";





//GENERAL
export type Process = 'MMA'|'TIG'|'MIGInv'|'MIGConv';
export const PROCESSES: Process[] = ['MMA', 'TIG', 'MIGInv', 'MIGConv'];

export type RatedCurrent = 200|250|300|350|400|500|600|1000;
export const POWERS: RatedCurrent[] = [200, 250, 300, 350, 400, 500, 600, 1000];

export type DeviceOrigin = 'db'|'manual'|'autodetect';
export type Unit = 'V'|'A'|'Ω'|'°C'|'mV'|'mA'|'kΩ'|'%';
export type Polarity = 'ok' | 'reversed' | 'open' | 'unknown';

export type Verdict = 
   'pass' | 'warn' | 'fail' | 'skipped' | 
   'OK' | 'aviso' | 'falhou' | 'ignorado' | '-' | 'N/A';




// STEPS - TODOS OS PASSOS
export type StepId = // 
   'detectPowerBank'
   //| 'testLBStep' 
   | 'pickProcedure' 
   // | 'specs' 
   // | 'dutSearch'
   | 'pickProcess' 
   | 'pickPower' 
   | 'pickBrand'
   // | 'dut' 
   // | 'interlocks' 
   // | 'connections' 
   // | 'selftests' 
   // | 'calstatus'
   | 'calibration'
   // | 'ocv'
   | 'summary' 
   | 'export';


// CHECKLISTS - APENAS ORDENS DOS PASSOS
// Steps themselves are globally defined in StepRegistry.ts.
export type ChecklistId = "VALCAL" | "TFL";
export const DEFAULT_CHECKLIST: ChecklistId = "VALCAL";

export const CHECKLISTS: Record<ChecklistId, StepId[]> = {
   VALCAL: [
      'detectPowerBank', 
      //'testLBStep',
      'pickProcedure',
      // 'specs', 
      // 'dutSearch',
      'pickProcess',
      'pickPower',
      'pickBrand',
      // 'dut', 
      // 'interlocks', 
      // 'connections', 
      // 'selftests', 
      // 'calstatus',
      'calibration', 
      // 'ocv',
      'summary',
      'export'
   ],
   TFL: [
      "detectPowerBank",
      //'testLBStep',
      "pickProcedure",
      // "specs",
      // 'dutSearch',
      "pickProcess",
      "pickPower",
      "pickBrand",
      // 'dut', 
      // 'interlocks', 
      // 'connections', 
      // 'selftests', 
      // 'calstatus',
      "calibration",
      // "ocv",
      "summary",
      "export",
   ]
};


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








// REPORT / DOMAIN
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
      // workflow flags / selections
      mode?: ChecklistId;
      manualSelect?: boolean;

      selectedProcess?: Process;
      minPowerA?: number;
      powerA?: RatedCurrent;
      brand?: string;
      productData?: ProductData;
      dutPatchedManual?: boolean;

      // runtime snapshots
      loadBank?: any;

      [k: string]: any;
   };
   finalVerdict?: Verdict;
   reportId?: string;
   generatedAt?: string;
   version?: number;
};
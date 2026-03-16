import type { 
   FuncData, 
   ProdCategory, 
   ProductData, 
   TechnicalData,
   ImageData
} from "./productTypes";
import type { Tol } from "./generalTypes";





//GENERAL
export type Process = 'MMA'|'TIG'|'MIGInv'|'MIGConv';
export const PROCESSES: Process[] = ['MMA', 'TIG', 'MIGInv', 'MIGConv'];

export type RatedCurrent = 200|250|300|350|400|500|600|1000;
export const POWERS: RatedCurrent[] = [200, 250, 300, 350, 400, 500, 600, 1000];

export type DeviceOrigin = 'db' | 'manual' | 'autodetect';
export type Unit = 'V' | 'A' | 'Ω' | '°C' | 'mV' | 'mA' | 'kΩ' | '%';
export type Polarity = 'ok' | 'reversed' | 'open' | 'unknown';

export type Verdict = 
   'pass' | 'warn' | 'fail' | 'skipped' | 
   'OK' | 'aviso' | 'falhou' | 'ignorado' | '-' | 'N/A';




// STEPS - TODOS OS PASSOS
export type StepId = // 
   'detectPowerBank'
   //| 'testLBStep' 
   | 'pickProcedure' 
   | 'pickProcess' 
   | 'pickPower' 
   | 'pickBrand'
   | 'calibration'// VALCAL main step (load-bank driven)
   | "tfl" // TFL runner (group-based, data-driven)
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
      'pickProcess',
      'pickPower',
      'pickBrand',
      'calibration', 
      'summary',
      'export'
   ],
   TFL: [
      "detectPowerBank",
      //'testLBStep',
      "pickProcedure",
      "pickProcess",
      "pickPower",
      "pickBrand",
      "tfl",
      'calibration', 
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



// -----------------------------------------------------------------------------
// TFL (group-based runner) schema
// -----------------------------------------------------------------------------

export type TflGroupVerdict = "pass" | "fail" | "warn";

export type TflGroupResult = {
   /** stable key (e.g. 'u2', 'cooling', 'final') */
   key: string;
   title: string;
   verdict: TflGroupVerdict;
   /** optional captured numeric value */
   value?: number;
   unit?: Unit;
   notes?: string;
};

export type TflRun = {
   /** e.g. 'L7.002' */
   procedureId: string;
   /** free text label shown to operator */
   procedureTitle?: string;
   /** optional model/family tag used to pick a default procedure */
   productFamily?: string;
   groups: TflGroupResult[];
};


export type ProcedureField = {
   key: string;
   label: string;
   type: "number" | "text" | "select" | "boolean";
   unit?: string;
   required?: boolean;
   options?: string[];
};

export type ProcedureCheck =
   | {
         kind: "instruction";
         checkId: string;
         label: string;
         instructions: string[];
      }
   | {
         kind: "valueForm";
         checkId: string;
         label: string;
         instructions?: string[];
         fields: ProcedureField[];
         expected?: {
         type: "range" | "tableLookup" | "note";
         value: unknown;
         };
      };

export type ProcedureSection = {
   sectionId: string;
   title: string;
   opRange?: { from: number; to: number };
   summaryKey: string;
   when?: {
      onlyModels?: string[];
      exceptModels?: string[];
      requiresCapabilities?: string[];
      onlyProcesses?: string[];
   };
   checks: ProcedureCheck[];
};

export type TflProcedureTemplate = {
   procedureId: string;
   title: string;
   checklist: "TFL";
   doc?: {
      code?: string;
      title?: string;
      revision?: string;
   };
   appliesTo: {
      category?: string;
      family?: string;
      models?: string[];
      processes?: string[];
   };
   capabilities?: string[];
   sections: ProcedureSection[];
};




// -----------------------------------------------------------------------------
// Submission (durable JSON)
// -----------------------------------------------------------------------------

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

      // TFL helpers
      tflProcedureId?: string;
      tflProductFamily?: string;

      [k: string]: any;
   };

   /** path-specific payloads */
   tfl?: TflRun;

   /** finalization */
   finalVerdict?: Verdict;
   reportId?: string;
   generatedAt?: string;
   version?: number;
};



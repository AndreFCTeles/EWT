import { Unit, Dut } from "./checklistTypes";
import { ProductData } from "./productTypes";







/* ──────────────────────────────────────────────────────────────────────────────
   Multimeter 
────────────────────────────────────────────────────────────────────────────── */
export interface MultimeterPoint { 
   key:string; 
   value:number; 
   unit:Unit; // | string;
   ts?:string 
}
export interface MultimeterReading { 
   _id?:string;
   dutSerial?:string; 
   dutRef?:string; 
   fileSource?:{ 
      path?:string; 
      hash?:string; 
      parsedAt?:string 
   }; 
   points:MultimeterPoint[]; 
   operator?:string; 
   station?:string; 
   createdAt?:string; 
   notes?:string 
}





/* ──────────────────────────────────────────────────────────────────────────────
   API
────────────────────────────────────────────────────────────────────────────── */
export type ApiOk<T>={ 
   ok:true; 
   data:T 
};
export type ApiErr={ 
   ok:false; 
   error:string 
};
export type ApiResponse<T>=ApiOk<T>|ApiErr;







/* ──────────────────────────────────────────────────────────────────────────────
   DuT profile 
────────────────────────────────────────────────────────────────────────────── */
export type DutProfileOrigin = 'profile' | 'product';    // | string;

export type DutProfileKey = string;                      // e.g. brand::prodName::series::catPath

export type DutProfile = {
   origin: DutProfileOrigin;                             // 'profile' from Perfis or 'product' from Produtos
   sourceId: string;                                     // Perfis._id or Produtos._id

   dutSnapshot: Dut;                                     // canonical DuT view
   productId?: string;
   productSnapshot?: ProductData;

   
   // Human ID
   brand: string;
   prodName: string;
   series?: string;

   // Category path
   categoryMain?: string;                                // 'maq'
   categorySub?: string;                                 // 'maq-mig', 'maq-tig', 'maq-mma', ...
   categorySubSub?: string;                              // 'maq-mig-bas', etc.
   format?: string;                                      // 'maq-mig-f-com', 'maq-mig-f-mod', ...
   

   // Useful derived fields
   key: string;                                          // brand::prodName::series::catPath
   supply?: { 
      phases: number; 
      voltage: number; 
      freqHz: number 
   };                                                    // from "3x400" etc
   ocv?: number | null;                                  // Open Circuit Voltage / Tensão de vazio

   updatedAt?: string;                                   // ISO, from Perfis.updatedDate or Produtos.updatedDate
};






/* ──────────────────────────────────────────────────────────────────────────────
   CALIBRATION/SETPOINTS
────────────────────────────────────────────────────────────────────────────── */
export type CalibrationSetpoint = {
   id: number;                // 1..4
   currentA: number;          // target current
   // future: targetVoltage, wireSpeed, etc.
};

export type ContactorOption = {
   mask: number;              // 16-bit mask, C1..C16
   comboDisplay: string[];
   comboLabel: string;
   errorLabel: string[];        // e.g. "R1+R3+R6" or "≈175 A @ 44 V"
   errorPercent: number;      // |I_actual - I_target| / I_target * 100
};

export type SetpointConfig = CalibrationSetpoint & {
   options: ContactorOption[];
};


export type TunnelIndex = 0 | 1 | 2 | 3;

export type LoadBankBranch = {
   id: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8";
   ohm: number;
   maskBit: number;           // which bit in contactorsMask corresponds to this branch
   tunnel: TunnelIndex;
   //maxKw: number;
};

export const LB_BRANCHES: LoadBankBranch[] = [
   { id: "R1", ohm: 4.28, maskBit: 1 << 0, tunnel: 0 }, // maxKw: 4.0,
   { id: "R2", ohm: 2.0, maskBit: 1 << 1, tunnel: 0 }, // maxKw: 4.0,

   { id: "R3", ohm: 1.0, maskBit: 1 << 2, tunnel: 1 }, // maxKw: 4.0,
   { id: "R4", ohm: 0.5, maskBit: 1 << 3, tunnel: 1 }, // maxKw: 4.0,

   { id: "R5", ohm: 0.36, maskBit: 1 << 4, tunnel: 2 }, // maxKw: 4.0,
   { id: "R6", ohm: 0.36, maskBit: 1 << 5, tunnel: 2 }, // maxKw: 4.0,

   { id: "R7", ohm: 0.23, maskBit: 1 << 6, tunnel: 3 }, // maxKw: 4.0,
   { id: "R8", ohm: 0.23, maskBit: 1 << 7, tunnel: 3 }, // maxKw: 4.0,
];

export type ComboCandidate = {
   mask: number;
   branches: LoadBankBranch[];
   reqOhm: number;

   u2V: number;
   approxCurrentA: number;

   // signed current error: (I_actual - I_target) / I_target
   errI: number;
   absErrI: number;

   // signed resistance error: (R_req - R_target) / R_target (Excel-like)
   errR: number;
   absErrR: number;

   // thermal / balance metadata
   score: number;
   maxBranchKw: number;
   maxBranchFactor: number; // max P_branch / P_R
   maxTunnelKw: number;

   // time-limited: min remaining ON time among branches considering duty-cycle budget
   // null => impossible (no overload window), Infinity => continuous
   maxOnMs: number | null;

   // duty-cycle metadata (debug / UI hints)
   cycleMs: number;
   usedOnMsMax: number;
   remainingOnMsMin: number | null;

   // UI warnings (not selection gates)
   outOfTolerance: boolean;
};

export type OverloadWindow = {
   factorMax: number;            // multiple of P_R allowed
   tOnMaxMs: number;             // max ON time for that factor
   cycleMs: number;              // reference cycle (120s)
};

export type ResistorSpec = {
   P_R: number;                  // e.g. 4000 W
   surfaceTmaxC: number;         // 450 °C
   overloadWindows: OverloadWindow[];
};

export const RDP4000: ResistorSpec = {
   P_R: 4000,
   surfaceTmaxC: 450,
   overloadWindows: [
      { factorMax: 7.5, tOnMaxMs:  5000, cycleMs: 120000 },
      { factorMax: 5.0, tOnMaxMs: 10000, cycleMs: 120000 },
      { factorMax: 2.8, tOnMaxMs: 20000, cycleMs: 120000 },
      { factorMax: 1.7, tOnMaxMs: 40000, cycleMs: 120000 },
   ],
};

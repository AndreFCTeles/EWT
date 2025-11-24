// CAL PARSE
export type MeasurementKind =
   | "voltage_dc"
   | "voltage_ac"
   | "current_dc"
   | "current_ac"
   | "other";
   // | string;
   
export type Wave = "dc" | "ac"; // | string;
export type UnitBase = "A" | "V";

export type SimpleTest = {
   kind: MeasurementKind;

   setpoint: number;
   unit: UnitBase;
   wave: Wave;

   stdReadings: [number, number, number];
   dutReadings: [number, number, number];

   stdMean: number;
   dutMean: number;

   stdError: number;
   trueValue: number;
   dutError: number;

   rulePercent: number;
   ruleLsdFactor: number;
   lsd?: number;

   emaAllowed: number;
   delta: number;
   pass: boolean; // delta <= emaAllowed

   ok: boolean; // “APTO/NAO APTO”
};

export type SimpleTestOld = {
   kind: MeasurementKind;
   reference: number;
   unit: string;
   rulePercent: number;
   ruleLsdFactor: number;
   lsd?: number;

   appreciationRaw?: string;
   usable?: boolean;
};

export type Instrument = { 
   code: string; 
   name?: string 
}

export type InstrumentRow = {
   instrument: Instrument;
   validatedAt?: string;
   verifiedAt?: string;
   source: "server" | "cache";
};
export type SimpleCalibration = InstrumentRow & {
   sourcePath?: string;
   fileHash?: string;
   tests: SimpleTest[];
};




// API

export type ExistsResponse = {
   exists: boolean;
   id?: string;
   identical?: boolean;
};

export type UpsertResponse = {
   ok: boolean;
   id?: string;
   created?: boolean;
   updated?: boolean;
};

export type UploadResponse = {
   ok: boolean;
   filePath: string;
   mediaDir?: string;
   media?: any[];
};


export type ListParams = {
   instrumentCode?: string;
   verifiedAt?: string;
   limit?: number;
};


// TABLE 
export type Row = {
   reference: number;
   unit: string;
   stdReadings: number[];
   dutReadings: number[];
   stdMean: number;
   dutMean: number;
   lsd: number;
   trueValue: number;
   dutError: number;
   emaAllowed: number;
   delta: number;
   pass: boolean;
};

export type Section = {
   title: string;
   kind: MeasurementKind;
   rule: { 
      percent: number; 
      lsdFactor: number 
   };
   rows: Row[];
   pass: boolean;
};

export type CalWithSections = SimpleCalibration & { sections?: any[] };
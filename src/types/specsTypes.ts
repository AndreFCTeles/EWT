import type { Dut, Process, Unit } from './checklistTypes';


export type SpecId = string;

export interface SpecsVerdict {
  pass: boolean;
  value: number;
  unit?: Unit; // | string;
  target?: number;
  min?: number;
  max?: number;
  reason?: string;
  ts?: string;
}

export interface Tolerance { 
  abs?: number; 
  pct?: number; 
}

export interface RangeSpec {
  target?: number;
  tol?: Tolerance;
  min?: number;
  max?: number;
  unit?: Unit; // | string;
}

export interface OcvSpec {
  enabled: boolean;
  channel: string;
  measureTimeoutMs?: number;
  range: RangeSpec;
}

export interface InterlocksSpec { 
  enabled: boolean; 
  required: string[]; 
  stableForMs?: number; 
}

export interface ConnectionsSpec { 
  enabled: boolean;  
  polarityOkName?: string; 
  allowAdminOverride?: boolean; 
}

export interface VrdSpec { 
  enabled: boolean; 
  channel: string; 
  range: RangeSpec; 
}

export interface LoadBankSpec {
  enabled: boolean;
  steps: Array<{ 
    resistance_ohm: number; 
    dwellMs?: number; 
    current?: RangeSpec; 
    voltage?: RangeSpec 
  }>;
}

export interface EolSpec {
  id: SpecId;
  model: string;
  version: string;
  processes?: Process[];
  ocv?: OcvSpec;        // Open Circuit Voltage / Tensão de vazio
  interlocks?: InterlocksSpec;
  connections?: ConnectionsSpec;
  vrd?: VrdSpec;
  loadbank?: LoadBankSpec;
  notes?: string;
}

export interface SpecIndexEntry { 
  match: (dut: Dut) => boolean; 
  specId: SpecId; 
}

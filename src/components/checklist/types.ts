import { Processes } from "@/utils/types";


export type StepId =
   | 'login' | 'dut' | 'specs'
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
   dut: { // device under test
      model: string; 
      serial: string; 
      firmware?: string; 
      processes: Array<Processes>; 
   };
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
   finalVerdict?: Verdict;
   reportId?: string;
};


export const PIPELINE: StepId[] = [
   'login', 'dut', 'specs',
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

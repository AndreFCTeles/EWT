import type { StepId, Submission, StepRecord } from '@/types/checklistTypes';
import type { Processes, Role } from '@/types/generalTypes';
import { StepRegistry } from './StepRegistry';
import SkipStep from './SkipStep';
//import { PIPELINE } from './checklistTypes';

/*
export const PIPELINE: StepId[] = [
   // 'login', 'dut', 'specs',
   'interlocks', 'connections', 'ocv',
   'proc:MIG:nominals', 'proc:MIG:start', 'proc:MIG:sweep', 'proc:MIG:pulse',
   'summary', 'export',
];
*/

export type StepRuntimeProps = {
   id: StepId;
   role: Role;
   isActive: boolean;                           // for admin overview
   
   alreadyCompleted: boolean;                   // true if this step already has a StepRecord in submission.steps
   goBack: () => void;
   canGoBack: boolean;
   
   submission: Submission;
   complete: (                                  // steps call this to finish
      record: StepRecord,
      patchVars?: Record<string, any>
   ) => void;
   abort: (reason: string) => void;             // hard stop
};

export const REGISTRY = StepRegistry;







// Skip Rules
export function shouldSkip(step: StepId, s: Submission): boolean {
   // Never skip summary
   if (step === 'summary' || step === 'export') return false;

   // If auto-detect, skip all manual
   const manual = s.vars?.manualSelect === true;
   if (step === 'pickProcess') return !manual || !!s.dut.processes?.length || !!s.vars?.selectedProcess;
   if (step === 'pickPower') return !manual || !!s.vars?.powerA;
   if (step === 'pickBrand') return !manual || !!s.vars?.brand;

   // Process-specific blocks already skip when DUT lacks the process
   if (step.startsWith('proc:')) {
      const proc = step.split(':')[1] as Processes;
      if (s.dut && !s.dut.processes.includes(proc)) return true;
      if (step === 'proc:MIG:pulse' && !s.vars?.['mig.usePulse']) return true;
   }

   // Skip any STUB (SkipStep)
   if (StepRegistry[step] === SkipStep) return true;
   // Example: skip OCV if model flag says “no-OCV” (rare)
   // if (step === 'ocv' && (s as any).dut.noOcv) return true;
   return false;
}



export function wasCompleted(s: Submission, id: StepId): boolean {
   return s.steps.some(r => r.id === id);
}
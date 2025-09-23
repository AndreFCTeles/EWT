import type { StepId, Submission, StepRecord } from './types';
import type { Processes, Role } from '@/utils/types';
import { StepRegistry } from '@/components/steps';

export const PIPELINE: StepId[] = [
   // Phase 0 (stubs for now)
   // 'login', 'dut', 'specs',
   'interlocks', 'connections', 'ocv',
   'proc:MIG:nominals', 'proc:MIG:start', 'proc:MIG:sweep', 'proc:MIG:pulse',
   'summary', 'export',
];

export type StepRuntimeProps = {
   id: StepId;
   role: Role;
   isActive: boolean;                          // important for admin overview
   submission: Submission;                     // read-only snapshot
   complete: (record: StepRecord) => void;     // steps call this to finish
   abort: (reason: string) => void;            // hard stop if needed
};

export const REGISTRY = StepRegistry;

// Simple, model-driven skip rules (expand as needed)
export function shouldSkip(step: StepId, s: Submission): boolean {
   if (step.startsWith('proc:')) {
      const proc = step.split(':')[1] as Processes;
      return !s.dut.processes.includes(proc);
   }
   // Example: skip OCV if model flag says “no-OCV” (rare)
   // if (step === 'ocv' && (s as any).dut.noOcv) return true;
   return false;
}

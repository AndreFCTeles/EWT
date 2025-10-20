import type { StepId, Submission, StepRecord } from '@/types/checklistTypes';
import type { Role } from '@/types/generalTypes';
import StepRegistry from '@checklist/StepRegistry';



export type StepRuntimeProps = {
   id: StepId;
   role: Role;
   isActive: boolean;                           // for admin overview
   
   alreadyCompleted: boolean;                   // true if this step already has a StepRecord in submission.steps
   goBack: () => void;
   canGoBack: boolean;
   
   complete: (                                  // steps call this to finish
      record: StepRecord,
      patchVars?: Record<string, any>
   ) => void;
   abort: (reason: string) => void;             // hard stop
   submission: Submission;
};

export const REGISTRY = StepRegistry;


export function wasCompleted(s: Submission, id: StepId): boolean {
   return s.steps.some(r => r.id === id);
}
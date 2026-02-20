import React, { useEffect, useMemo, useCallback } from 'react';
import { useMachine } from '@xstate/react';

import { checklistMachine, wasCompleted, type StepRuntimeProps } from './pipeline';
import { STEP_REGISTRY, AUTO_COMPONENTS } from '@checklist/StepRegistry';
import SkipStep from './SkipStep';

import type { Submission, StepRecord, StepId } from '@/types/checklistTypes';
import { PIPELINE } from '@/types/checklistTypes';
import type { Role } from '@/types/generalTypes';






type Props = {
   role: Role;
   submission: Submission;
   setSubmission: (s: Submission) => void;
   jumpTo?: StepId | null;
};





/* ---- COMPONENT ---- */
export function ChecklistController({ 
   role, 
   submission, 
   setSubmission, 
   jumpTo = null 
}: Props) {
   const [state, send] = useMachine(checklistMachine, {
      input: { pipeline: PIPELINE, initialSubmission: submission },
   });
   const { idx, submission: ctxSubmission, pipeline } = state.context;
   const activeId = pipeline[idx];






   /* ---- STEPPER ---- */
   useEffect(() => { setSubmission(ctxSubmission); }, [ctxSubmission, setSubmission]);

   useEffect(() => {
      if (!jumpTo) return;
      send({ type: 'JUMP', to: jumpTo });
   }, [jumpTo, send]);





   /* ---- NAV ---- */
   const prevManualIndex = useMemo(() => { // prev man step / skip auto
      for (let i = idx - 1; i >= 0; i--) {
         const C = (STEP_REGISTRY as any)[pipeline[i]] ?? SkipStep;
         if (!AUTO_COMPONENTS.has(C as React.FC<StepRuntimeProps>)) return i;
      }
      return -1;
   }, [idx, pipeline]);

   /*
   const goBack = () => {
      if (prevManualIndex >= 0) {
         send({ type: 'BACK_TO', to: pipeline[prevManualIndex] });
      }
   };
   */
   const goBack = useCallback(() => {
      if (prevManualIndex >= 0) {
         send({ type: 'BACK_TO', to: pipeline[prevManualIndex] });
      }
   }, [send, prevManualIndex, pipeline]);

   /*
   const apply = (record: StepRecord, patchVars?: Record<string, unknown>) =>
      send({ type: 'APPLY', record, patchVars });
   */
   const apply = useCallback(
      (record: StepRecord, patchVars?: Record<string, unknown>) =>
         send({ type: 'APPLY', record, patchVars }),
      [send]
   );

   /*
   const complete = (record: StepRecord, patchVars?: Record<string, unknown>) =>
      send({ type: 'COMPLETE', record, patchVars });
   */
   const complete = useCallback(
      (record: StepRecord, patchVars?: Record<string, unknown>) =>
         send({ type: 'COMPLETE', record, patchVars }),
      [send]
);

   //const abort = (reason: string) => send({ type: 'ABORT', reason });
   const abort = useCallback((reason: string) => send({ type: 'ABORT', reason }), [send]);

   const StepComp = ((STEP_REGISTRY)[activeId] as React.FC<StepRuntimeProps>) ?? SkipStep;

   const runtimeProps: StepRuntimeProps = {
      id: activeId,
      role,
      isActive: true,
      alreadyCompleted: wasCompleted(ctxSubmission, activeId),
      canGoBack: prevManualIndex >= 0,
      goBack,
      submission: ctxSubmission,
      apply,
      complete,
      abort,
   };

   return <StepComp {...runtimeProps} />;
}

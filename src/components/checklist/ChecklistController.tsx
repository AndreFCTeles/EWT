import { useEffect, useMemo, useCallback } from 'react';//React, 
import { useMachine } from '@xstate/react';

import { checklistMachine, wasCompleted, type StepRuntimeProps } from './pipeline';
import { STEP_REGISTRY, isHiddenStep } from '@checklist/StepRegistry'; //, AUTO_COMPONENTS
//import SkipStep from './SkipStep';

import type { Submission, StepRecord, StepId, ChecklistId } from '@/types/checklistTypes';
import { CHECKLISTS, DEFAULT_CHECKLIST } from '@/types/checklistTypes';
import type { Role } from '@/types/generalTypes';






type Props = {
   role: Role;
   submission: Submission;
   setSubmission: (s: Submission) => void;

   checklistId?: ChecklistId; // NEW
   jumpTo?: StepId | null;
};


function inferChecklistId(sub: Submission): ChecklistId {
   return (sub.vars?.mode as ChecklistId) ?? DEFAULT_CHECKLIST;
}



/* ---- COMPONENT ---- */
export function ChecklistController({ 
   role, 
   submission, 
   setSubmission, 
   checklistId// = DEFAULT_CHECKLIST,
   //jumpTo = null 
}: Props) {
   //const pipeline = CHECKLISTS[checklistId];
   
   const effectiveChecklist = checklistId ?? inferChecklistId(submission);
   const desiredPipeline = CHECKLISTS[effectiveChecklist];
   const [state, send] = useMachine(checklistMachine, {
      input: { 
         //pipeline: CHECKLISTS.calibration, 
         //pipeline,
         pipeline: desiredPipeline,
         //initialSubmission: submission 
         initialSubmission: submission,
         //summaryStepId: "summary" as StepId,
      },
   });






   /* ---- STEPPER ---- */
   //useEffect(() => { setSubmission(ctxSubmission); }, [ctxSubmission, setSubmission]);
   
   // keep outer submission synced to machine submission
   useEffect(() => {
      setSubmission(state.context.submission);
   }, [state.context.submission, setSubmission]);

   /*
   useEffect(() => {
      if (!jumpTo) return;
      send({ type: 'JUMP', to: jumpTo });
   }, [jumpTo, send]);
   */

   // if pickProcedure changed mode, swap pipeline (diverge immediately)
   useEffect(() => {
      if (state.context.pipeline !== desiredPipeline) {
         send({ type: "SET_PIPELINE", pipeline: desiredPipeline });
      }
   }, [desiredPipeline, state.context.pipeline, send]);



   /*
   const { 
      idx, 
      submission: ctxSubmission, 
      //pipeline 
   } = state.context;
   
   const StepComp = ((STEP_REGISTRY)[activeId] as React.FC<StepRuntimeProps>) ?? SkipStep;
   const activeId = pipeline[idx];
   */

   const pipeline = state.context.pipeline;
   const idx = state.context.idx;
   const ctxSubmission = state.context.submission;

   const activeId = pipeline[idx] as StepId;
   const StepComp = STEP_REGISTRY[activeId];



   /* ---- NAV ---- */
  // Back: skip only hidden/system steps (NOT "skipped verdict" steps)
   const prevVisibleIndex = useMemo(() => {
      for (let i = idx - 1; i >= 0; i--) {
         const id = pipeline[i];
         if (!isHiddenStep(id)) return i;
      }
      return -1;
   }, [idx, pipeline]);
   /*
   const prevManualIndex = useMemo(() => { // prev man step / skip auto
      for (let i = idx - 1; i >= 0; i--) {
         const C = (STEP_REGISTRY as any)[pipeline[i]] ?? SkipStep;
         if (!AUTO_COMPONENTS.has(C as React.FC<StepRuntimeProps>)) return i;
      }
      return -1;
   }, [idx, pipeline]);
   */

   /*
   const goBack = () => {
      if (prevManualIndex >= 0) {
         send({ type: 'BACK_TO', to: pipeline[prevManualIndex] });
      }
   };
   */
   /*
   const goBack = useCallback(() => {
      if (prevManualIndex >= 0) {
         send({ type: 'BACK_TO', to: pipeline[prevManualIndex] });
      }
   }, [send, prevManualIndex, pipeline]);
   */

   const goBack = useCallback(() => {
      if (prevVisibleIndex >= 0) {
         send({ type: "BACK_TO", to: pipeline[prevVisibleIndex] });
      }
   }, [send, prevVisibleIndex, pipeline]);




   // API for steps stays the same, but internally we dispatch UPSERT
   /*
   const apply = (record: StepRecord, patchVars?: Record<string, unknown>) =>
      send({ type: 'APPLY', record, patchVars });
   */
   const apply = useCallback(
      (record: StepRecord, patchVars?: Record<string, unknown>) =>
      //send({ type: 'APPLY', record, patchVars }),
      send({ type: "UPSERT", record, patchVars, advance: false }),
      [send]
   );
   /*
   const complete = (record: StepRecord, patchVars?: Record<string, unknown>) =>
      send({ type: 'COMPLETE', record, patchVars });
   */
   const complete = useCallback(
      (record: StepRecord, patchVars?: Record<string, unknown>) =>
      //send({ type: 'COMPLETE', record, patchVars }),
      send({ type: "UPSERT", record, patchVars, advance: true }),
      [send]
);

   //const abort = (reason: string) => send({ type: 'ABORT', reason });
   const abort = useCallback((reason: string) => send({ type: 'ABORT', reason }), [send]);


   const runtimeProps: StepRuntimeProps = {
      id: activeId,
      role,
      isActive: true,
      alreadyCompleted: wasCompleted(ctxSubmission, activeId),
      canGoBack: prevVisibleIndex >= 0,//canGoBack: prevManualIndex >= 0,
      goBack,
      submission: ctxSubmission,
      apply,
      complete,
      abort,
   };

   return <StepComp {...runtimeProps} />;
}

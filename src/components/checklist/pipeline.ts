import { setup, assign } from 'xstate';


import { buildReport } from '@utils/report';
import type { StepId, Submission, StepRecord } from '@/types/checklistTypes';
import type { Role } from '@/types/generalTypes';



import { nowIso } from '@/services/utils/generalUtils';








export type StepRuntimeProps = {
   id: StepId;
   role: Role;
   isActive: boolean;                           // TODO: admin overview   

   // TODO?: remover isto? Q: é possível simplesmente deixar XState cuidar disto?
   alreadyCompleted: boolean;                   // StepRecord já em submission.steps

   goBack: () => void;
   canGoBack: boolean;
   
   apply: ( 
      record: StepRecord,
      patchVars?: Record<string, any>
   ) => void;                                   // End
   complete: (
      record: StepRecord,
      patchVars?: Record<string, any>
   ) => void;                                   // End, next step
   abort: (reason: string) => void;             // hard stop 
   // TODO: Restart: () => void?

   submission: Submission;
};




type ApplyEvt = { 
   type: 'APPLY'; 
   record: StepRecord; 
   patchVars?: Record<string, unknown> 
};
type CompleteEvt = { 
   type: 'COMPLETE'; 
   record: StepRecord; 
   patchVars?: Record<string, unknown> 
};
type JumpEvt = { 
   type: 'JUMP'; 
   to: StepId 
};
type BackEvt = { 
   type: 'BACK_TO'; 
   to: StepId 
}; // compute prev manual
type AbortEvt = { 
   type: 'ABORT'; 
   reason: string 
};




/* ---------- Submission Helpers (pure/immutable) ---------- */
export const wasCompleted = (sub: Submission, id: StepId) => sub.steps.some((s) => s.id === id);

const shallowEqualKeys = (
   a: Record<string, unknown>, 
   b: Record<string, unknown>, 
   keys: string[]
) => {
   for (const k of keys) if (a[k] !== b[k]) return false;
   return true;
}

const upsertSubmission = (
   sub: Submission,
   record: StepRecord,
   patchVars?: Record<string, unknown>
): Submission => {
   const incoming = patchVars ?? {};
   const keys = Object.keys(incoming);
   const nextVars = keys.length ? { ...(sub.vars ?? {}), ...incoming } : (sub.vars ?? {});
   const varsChanged = keys.length ? !shallowEqualKeys(sub.vars ?? {}, nextVars, keys) : false;

   const old = sub.steps.find((s) => s.id === record.id);
   const recChanged = !old || JSON.stringify(old) !== JSON.stringify(record);
   if (!recChanged && !varsChanged) return sub;

   const dut = (incoming as any).dut ?? sub.dut;
   const steps = old
      ? sub.steps.map((s) => (s.id === record.id ? record : s))
      : [...sub.steps, record];

   return { ...sub, steps, vars: nextVars, dut };
}




/* ---------- XState machine ---------- */
export type ChecklistEvent = ApplyEvt | CompleteEvt | JumpEvt | BackEvt | AbortEvt;
export type ChecklistContext = {
   pipeline: StepId[];
   idx: number;
   submission: Submission;
};
type ChecklistInput = {
  pipeline: StepId[];               // order used by the run (your STEP_ORDER/plan)
  initialSubmission: Submission;     // initial submission object
};


export const checklistMachine = setup({
   types: {
      context: {} as ChecklistContext,
      events: {} as ChecklistEvent,
      input: {} as ChecklistInput,
   },
   guards: {
      isSummaryEvent: (_ctx, evt) => (evt as CompleteEvt).record?.id === ('summary' as StepId),
   },
   actions: {
      applyAction: assign(({ context, event }) => {
         const e = event as ApplyEvt | CompleteEvt;
         return {
            submission: upsertSubmission(context.submission, e.record, e.patchVars),
         };
      }),
      buildReportAction: assign(({ context }) => {
         const built = buildReport(context.submission);
         return { submission: built };
      }),
      nextAction: assign(({ context }) => {
         const to = Math.min(context.idx + 1, context.pipeline.length - 1);
         return { idx: to };
      }),
      jumpAction: assign(({ context, event }) => {
         const id = (event as JumpEvt).to;
         const to = context.pipeline.indexOf(id);
         return to >= 0 ? { idx: to } : {};
      }),
      backToAction: assign(({ context, event }) => {
         const id = (event as BackEvt).to;
         const to = context.pipeline.indexOf(id);
         return to >= 0 ? { idx: to } : {};
      }),
      abortToSummaryAction: assign(({ context, event }) => {
         const reason = (event as AbortEvt).reason;
         const currentId = context.pipeline[context.idx];
         const now = nowIso();
         const fail: StepRecord = {
            id: currentId,
            startedAt: now,
            endedAt: now,
            verdict: 'fail',
            notes: [reason],
         };
         const updated = upsertSubmission(context.submission, fail);
         const sumIdx = context.pipeline.indexOf('summary' as StepId);
         return {
            submission: updated,
            idx: sumIdx >= 0 ? sumIdx : context.idx,
         };
      }),
   },
}).createMachine({
   /** @xstate-layout N4IgpgJg5mDOIC5QGMAWZkGsA2BLWALgHSFgAOAxAIIAKNAMgJoDaADALqKhkD2suBXDwB2XEAA9EAJgCcAViIAWOQGYAjFLkAaEAE9EANk1EjcgL5mdaDDnzFSlAMIB5ALIMAogBUPbTkhBefkERMUkEAFoVVgMTeXVNHX0EFUU1IgB2AzlTCyt0LDxCEgJyChd3em9fNX9uPgEhUQDwtW09REUADnSVORkVDPNLEGtCuxKygCkAVXc-MSDG0JbpGViumS7FQfbkzS6lGM080YLbYocKACEqRwBpAH0vZwWApZDm0HDZViI+tqmJKINRGJSqDTDfI2Ir2UqUKjXZwAJS8b3qwSaYWkBnScgyrASe0MsWGI2EPAgcDEYwuBEWDU+2MifUUcQhiQ6kSkalOtNhkzIDMxK2+iGiGUyih5XSGwIQGSkpIyPROFjMQA */   
   id: 'checklist',
   context: ({ input }) => ({
      pipeline: input.pipeline,
      idx: 0,
      submission: input.initialSubmission,
   }),
   initial: 'step',
   states: {
      step: {
         on: {
            APPLY: { actions: 'applyAction' },
            COMPLETE: [
               {
                  //guard: 'isSummaryEvent',
                  guard: ({ event }) => event.type === 'COMPLETE' && event.record?.id === ('summary' as StepId),
                  actions: ['applyAction', 'buildReportAction', 'nextAction'],
               },
               { actions: ['applyAction', 'nextAction'] },
            ],
            JUMP: { actions: 'jumpAction' },
            BACK_TO: { actions: 'backToAction' },
            ABORT: { actions: 'abortToSummaryAction' },
         },
      },
   },
});
import { setup, assign } from 'xstate';

//import { buildReport as defaultBuildReport } from '@utils/report';
import type { StepId, Submission, StepRecord } from '@/types/checklistTypes';
import type { Role } from '@/types/generalTypes';
import { nowIso } from '@/services/utils/generalUtils';

//import { nowIso } from '@/services/utils/generalUtils';








export type StepRuntimeProps = {
   id: StepId;
   role: Role;
   isActive: boolean;                           // TODO: admin overview   

   // TODO?: remover isto? Q: é possível simplesmente deixar XState cuidar disto?
   alreadyCompleted: boolean;                   // StepRecord já em submission.steps

   canGoBack: boolean;
   goBack: () => void;
   
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










// -----------------------------------------------------------------------------
// Submission Helpers (pure/immutable)
// -----------------------------------------------------------------------------

export const wasCompleted = (sub: Submission, id: StepId) => sub.steps.some((s) => s.id === id);

/*
const ROOT_KEYS = new Set<string>([
   "dut",
   "header",
   "instruments",
   "env",
   "finalVerdict",
   "generatedAt",
   "version",
   "reportId",
   "steps",
]);
*/

/*
const shallowEqualKeys = (
   a: Record<string, unknown>, 
   b: Record<string, unknown>, 
   keys: string[]
) => {
   for (const k of keys) if (a[k] !== b[k]) return false;
   return true;
}
*/

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
   !!v && typeof v === "object" && !Array.isArray(v);

const deepMerge = (base: unknown, patch: unknown): unknown => {
   if (!isPlainObject(base) || !isPlainObject(patch)) return patch ?? base;
   const out: Record<string, unknown> = { ...base };
   for (const [k, pv] of Object.entries(patch)) {
      const bv = out[k];
      if (isPlainObject(bv) && isPlainObject(pv)) out[k] = deepMerge(bv, pv);
      else out[k] = pv;
   }
   return out;
};

/*
const setIn = (obj: any, path: string[], value: unknown): any => {
   if (!path.length) return value;
   const [head, ...rest] = path;
   const cur = obj ?? {};
   // clone the current node (object)
   return {
      ...(isPlainObject(cur) ? cur : {}),
      [head]: setIn(cur[head], rest, value),
   };
};

const applyPatchVars = (sub: Submission, patchVars?: Record<string, unknown>) => {
   if (!patchVars) return sub;

   const varsPatch: Record<string, unknown> = {};
   const rootReplace: Record<string, unknown> = {};
   const dotPatches: Array<[string, unknown]> = [];

   for (const [k, v] of Object.entries(patchVars)) {
      if (k.includes(".")) dotPatches.push([k, v]);
      else if (ROOT_KEYS.has(k)) rootReplace[k] = v;
      else varsPatch[k] = v;
   }

   let next: Submission = sub;

   // 1) varsPatch -> submission.vars (deep merge)
   if (Object.keys(varsPatch).length) {
      const mergedVars = deepMerge(next.vars ?? {}, varsPatch) as Record<string, unknown>;
      next = { ...next, vars: mergedVars };
   }

   // 2) rootReplace -> submission root (replace)
   if (Object.keys(rootReplace).length) {
      next = { ...next, ...(rootReplace as any) };
   }

   // 3) dotPatches -> patch root via dot paths (supports "vars.*" too)
   for (const [dot, value] of dotPatches) {
      const parts = dot.split(".").filter(Boolean);
      next = setIn(next as any, parts, value);
   }

   return next;
};
*/

function setDotPath(obj: any, dot: string, value: unknown): any {
   const parts = dot.split(".").filter(Boolean);
   if (parts.length === 0) return obj;

   const out = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
   let cur = out;

   for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const next = cur[k];
      cur[k] = Array.isArray(next) ? [...next] : { ...(next ?? {}) };
      cur = cur[k];
   }

   cur[parts[parts.length - 1]] = value;
   return out;
}

/**
 * Patch semantics (kept deliberately simple):
 *
 * - If patch has any of {root, vars, tfl}, treat it as a structured patch.
 * - Otherwise, treat patch as vars patch, BUT allow dot-path keys to patch root
 *   (e.g. {"instruments.lbId": "600A-1"}).
 */
function applyPatch(sub: Submission, patch?: Record<string, any>): Submission {
   if (!patch || !isPlainObject(patch)) return sub;

   const hasStructured = "root" in patch || "vars" in patch || "tfl" in patch;

   if (hasStructured) {
      const root = (patch as any).root as Partial<Submission> | undefined;
      const vars = (patch as any).vars as Record<string, any> | undefined;
      const tfl = (patch as any).tfl as Submission["tfl"] | undefined;

      return {
         ...sub,
         ...(root ?? {}),
         vars: { ...(sub.vars ?? {}), ...(vars ?? {}) },
         tfl: tfl ? ({ ...(sub.tfl ?? ({} as any)), ...tfl } as any) : sub.tfl,
      };
   }

   // legacy patch: vars merge + dot-path root patch
   const flat = patch as Record<string, any>;
   const varsPatch: Record<string, any> = {};
   const dotKeys: string[] = [];

   for (const k of Object.keys(flat)) {
      if (k.includes(".")) dotKeys.push(k);
      else varsPatch[k] = flat[k];
   }

   let next: Submission = {
      ...sub,
      vars: { ...(sub.vars ?? {}), ...varsPatch },
   };

   for (const dk of dotKeys) {
      next = setDotPath(next, dk, flat[dk]);
   }

   return next;
}


/*
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
*/

const upsertSubmission = (
   sub: Submission,
   record: StepRecord,
   patchVars?: Record<string, unknown>
): Submission => {
   const old = sub.steps.find((s) => s.id === record.id);
   const steps = old
      ? sub.steps.map((s) => (s.id === record.id ? record : s))
      : [...sub.steps, record];

   /*
   let next = sub;
   next = applyPatchVars(next, patchVars);
   next = { ...next, steps: nextSteps };

   return next;
   */

   const patched = applyPatch(sub, patchVars);
   return { ...patched, steps };
};



// -----------------------------------------------------------------------------
// XState machine
// -----------------------------------------------------------------------------

/*
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
*/

type UpsertEvt = {
   type: "UPSERT";
   record: StepRecord;
   patchVars?: Record<string, unknown>;
   advance?: boolean;
};
type SetPipelineEvt = {
   type: "SET_PIPELINE";
   pipeline: StepId[];
};
type JumpEvt = { type: 'JUMP'; to: StepId };
type BackEvt = { type: 'BACK_TO'; to: StepId }; 
type AbortEvt = { type: 'ABORT'; reason: string };

export type ChecklistEvent = UpsertEvt | SetPipelineEvt | JumpEvt | BackEvt | AbortEvt; // ApplyEvt | CompleteEvt
/*export type ChecklistContext = {
   pipeline: StepId[];
   idx: number;
   submission: Submission;
   summaryStepId: StepId;
   buildReport: (s: Submission) => Submission;
};*/
export type ChecklistContext = {
   pipeline: StepId[];
   idx: number;
   submission: Submission;
};
/*export type ChecklistInput = {
   pipeline: StepId[];                  // order used by the run (your STEP_ORDER/plan)
   initialSubmission: Submission;       // initial submission object
   buildReport?: (s: Submission) => Submission;
   summaryStepId?: StepId;             // default "summary"
};*/
export type ChecklistInput = {
   pipeline: StepId[];
   initialSubmission: Submission;
};

export const checklistMachine = setup({
   types: {
      context: {} as ChecklistContext,
      events: {} as ChecklistEvent,
      input: {} as ChecklistInput,
   },
   guards: {
      //isSummaryEvent: (_ctx, evt) => (evt as CompleteEvt).record?.id === ('summary' as StepId),
      shouldAdvance: ({ event }) => event.type === "UPSERT" && !!event.advance,
      /*
      shouldBuildReport: ({ context, event }) => 
         event.type === "UPSERT" &&
         !!event.advance &&
         event.record.id === context.summaryStepId,
      */
   },
   actions: {
      /*
      applyAction: assign(({ context, event }) => {
         const e = event as ApplyEvt | CompleteEvt;
         return {
            submission: upsertSubmission(context.submission, e.record, e.patchVars),
         };
      }),
      upsertAction: assign(({ context, event }) => {
         const e = event as UpsertEvt;
         return {
            submission: upsertSubmission(context.submission, e.record, e.patchVars),
         };
      }),
      */
      upsertAction: assign(({ context, event }) => {
         if (event.type !== "UPSERT") return {};
         return {
            submission: upsertSubmission(context.submission, event.record, event.patchVars),
         };
      }),
      /*
      buildReportAction: assign(({ context }) => {
         const built = buildReport(context.submission);
         return { submission: built };
      }),
      */
      /*
      buildReportAction: assign(({ context }, _p, meta) => {
         const builder = meta.input.buildReport ?? defaultBuildReport;
         return { submission: builder(context.submission) };
      }),
      buildReportAction: assign(({ context }) => {
         return { submission: context.buildReport(context.submission) };
      }),
      */

      nextAction: assign(({ context }) => {
         const to = Math.min(context.idx + 1, context.pipeline.length - 1);
         return { idx: to };
      }),

      setPipelineAction: assign(({ context, event }) => {
         if (event.type !== "SET_PIPELINE") return {};

         const oldActive = context.pipeline[context.idx];
         const newPipeline = event.pipeline;
         const mappedIdx = oldActive ? newPipeline.indexOf(oldActive) : -1;

         return {
            pipeline: newPipeline,
            idx:
               mappedIdx >= 0
                  ? mappedIdx
                  : Math.max(0, Math.min(context.idx, newPipeline.length - 1)),
         };
      }),
      /*
      jumpAction: assign(({ context, event }) => {
         const id = (event as JumpEvt).to;
         const to = context.pipeline.indexOf(id);
         return to >= 0 ? { idx: to } : {};
      }),
      */
      jumpAction: assign(({ context, event }) => {
         if (event.type !== "JUMP") return {};
         const to = context.pipeline.indexOf(event.to);
         return to >= 0 ? { idx: to } : {};
      }),
      /*
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
      */
      backToAction: assign(({ context, event }) => {
         if (event.type !== "BACK_TO") return {};
         const to = context.pipeline.indexOf(event.to);
         return to >= 0 ? { idx: to } : {};
      }),
      /*
      abortToSummaryAction: assign(({ context, event }) => {
         if (event.type !== "ABORT") return {};
         const sumIdx = context.pipeline.indexOf(context.summaryStepId);
         return { idx: sumIdx >= 0 ? sumIdx : context.idx };
      }),
      */

      abortAction: assign(({ context, event }) => {
         if (event.type !== "ABORT") return {};

         // keep it simple: record a failure on the current step (if possible)
         const id = context.pipeline[context.idx];
         const now = nowIso();
         const record: StepRecord = {
            id,
            startedAt: now,
            endedAt: now,
            verdict: "fail",
            notes: [event.reason],
         };

         return { submission: upsertSubmission(context.submission, record) };
      }),
   },
}).createMachine({
   /** @xstate-layout N4IgpgJg5mDOIC5QGMAWZkGsA2BLWALgHSFgAOAxAIIAKNAMgJoDaADALqKhkD2suBXDwB2XEAA9EAJgCcAViIAWOQGYAjFLkAaEAE9EANk1EjcgL5mdaDDnzFSlAMIB5ALIMAogBUPbTkhBefkERMUkEAFoVVgMTeXVNHX0EFUU1IgB2AzlTCyt0LDxCEgJyChd3em9fNX9uPgEhUQDwtW09REUADnSVORkVDPNLEGtCuxKygCkAVXc-MSDG0JbpGViumS7FQfbkzS6lGM080YLbYocKACEqRwBpAH0vZwWApZDm0HDZViI+tqmJKINRGJSqDTDfI2Ir2UqUKjXZwAJS8b3qwSaYWkBnScgyrASe0MsWGI2EPAgcDEYwuBEWDU+2MifUUcQhiQ6kSkalOtNhkzIDMxK2+iGiGUyih5XSGwIQGSkpIyPROFjMQA */   
   id: 'checklist',
   initial: 'step',
   context: ({ input }) => ({
      pipeline: input.pipeline,
      idx: 0,
      submission: input.initialSubmission,
      //summaryStepId: input.summaryStepId ?? ("summary" as StepId),
      //buildReport: input.buildReport ?? defaultBuildReport,
   }),
   states: {
      step: {
         on: {
         SET_PIPELINE: { actions: [{ type: "setPipelineAction" }] },
            /*
            APPLY: { actions: 'applyAction' },
            COMPLETE: [
               {
                  //guard: 'isSummaryEvent',
                  guard: ({ event }) => event.type === 'COMPLETE' && event.record?.id === ('summary' as StepId),
                  actions: ['applyAction', 'buildReportAction', 'nextAction'],
               },
               { actions: ['applyAction', 'nextAction'] },
            ],
            */
            UPSERT: [
               {
                  guard: { type: "shouldAdvance" }, // "shouldBuildReport",
                  actions: [
                     { type: "upsertAction" },
                     //{ type: "buildReportAction" },
                     { type: "nextAction" },
                  ],
               },
               /*
               {
                  guard: "shouldAdvance",
                  actions: [{ type: "upsertAction" }, { type: "nextAction" }],
               },
               */
               { actions: [{ type: "upsertAction" }] },
            ],
            JUMP: { actions: [{ type: "jumpAction" }] },
            BACK_TO: { actions: [{ type: "backToAction" }] },
            ABORT: { actions: [{ type: "abortAction" }] }, //[{ type: "abortToSummaryAction" }]
         },
      },
   },
});
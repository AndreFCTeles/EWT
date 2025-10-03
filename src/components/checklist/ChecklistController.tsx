import { useState,  useCallback, useMemo } from 'react';//useEffect,
import { Card, Loader, Text } from '@mantine/core';
import dayjs from '@/lib/dayjs-setup';

import { REGISTRY, shouldSkip, wasCompleted, StepRuntimeProps } from './pipeline';
import { buildReport } from '@/services/utils/report';
//import { buildDummyDut } from '@/services/utils/dutBuilder';
import { buildDummyProduct, dummyToDut } from '@/services/utils/dummyProduct';

import { Submission, StepId, StepRecord, PIPELINE } from './checklistTypes'; 
import { Role } from '@/services/generalTypes';



type Props = {
   role: Role;
   submission: Submission;
   setSubmission: (s: Submission) => void;
   jumpTo?: StepId | null;
};


export function ChecklistController({ 
   role, 
   submission, 
   setSubmission, 
   //jumpTo = null 
}: Props) {
   const [idx, setIdx] = useState(0);
   const activeId = PIPELINE[idx];
   //const [activeId, setActiveId] = useState<StepId>(PIPELINE[idx]);


   const nextIndexWith = useCallback((i: number, s: Submission) => {//, s: Submission
      let j = i + 1;
      while (j < PIPELINE.length && shouldSkip(PIPELINE[j], s)) {
         console.log('Skipping', PIPELINE[j]);
         j++;
      } // se tirar console.log, apenas j++;
      //return Math.min(j, PIPELINE.length - 1);
      
      console.log('Next index =', j, '->', PIPELINE[j]);
      return j;
   }, []); // }, [submission]);

   // --- Legacy: compute next using current submission in closure (still used by go-forward button if needed) ---
   const nextIndex = useCallback((i: number) => nextIndexWith(i, submission), [submission, nextIndexWith]);


   const prevCompletedIndex = useMemo(() => {
      let j = idx - 1;
      const completed = new Set(submission.steps.map(s => s.id));
      while (j >= 0) {
         const id = PIPELINE[j];
         if (completed.has(id)) return j
         j--;
      }
      return -1;
   }, [idx, submission.steps]);

   // Jump (admin)
   /*
   useEffect(() => {
      if (jumpTo && PIPELINE.includes(jumpTo)) {
         setIdx(PIPELINE.indexOf(jumpTo));
         setActiveId(jumpTo);
      }
   }, [jumpTo]);
   */

   // Advance while skipping
   const advance = useCallback((from = idx) => {
      let j = nextIndex(from);
      //while (j < PIPELINE.length && shouldSkip(PIPELINE[j], submission)) j++;
      if (j >= PIPELINE.length) return;
      setIdx(j);
   }, [idx, nextIndex]);

   const goBack = useCallback(() => {
      if (prevCompletedIndex >= 0) setIdx(prevCompletedIndex);
   }, [prevCompletedIndex]);
   /*
   const advance = useCallback((from = idx) => {
      let i = from + 1;
      while (i < PIPELINE.length && shouldSkip(PIPELINE[i], submission)) i++;
      if (i >= PIPELINE.length) {
         setActiveId('export');
         setIdx(PIPELINE.length - 1);
      } else {
         setIdx(i);
         setActiveId(PIPELINE[i]);
      }
   }, [idx, submission]);
   */

   
   
   
   
   // --- The heart: complete() builds the *next* submission first, then advances using that state ---
   const complete = (record: StepRecord, patchVars?: Record<string, any>) => {
      // merge vars first
      const mergedVars = { ...(submission.vars ?? {}), ...(patchVars ?? {}) };

      // take current dut (may be undefined on first steps)
      let dut = submission.dut;

      // 1) If a step passed a dut (e.g., DetectDut), trust it
      if (mergedVars.dut) { dut = mergedVars.dut; }


      // 2) Manual path: if we have all picks, synthesize ProductData + DUT once
      const haveAllManual =
         mergedVars.manualSelect === true &&
         !!mergedVars.selectedProcess &&
         !!mergedVars.powerA &&
         !!mergedVars.brand;

      if (haveAllManual && !mergedVars.dutPatchedManual && !dut) {
         const dummyProduct = buildDummyProduct(
            mergedVars.selectedProcess!,
            mergedVars.powerA!,
            mergedVars.brand!
         );
         mergedVars.productData = dummyProduct; // keep full ProductData for export/report
         mergedVars.dutPatchedManual = true;    // guard so we don't rebuild on minor edits
         dut = dummyToDut(dummyProduct);        // small runtime DUT used by pipeline skip rules
      }

      // 3) Record keeping (replace if already present)
      const already = wasCompleted(submission, record.id);
      const steps = already
         ? submission.steps.map(s => (s.id === record.id ? record : s))
         : [...submission.steps, record];

      // 4) Build the *new* submission object
      const nextSub: Submission = {
         ...submission,
         steps,
         vars: mergedVars, // ⬅️ use the merged vars we built above (don’t rebuild here)
         dut,
      };

      // 5) Compute report at summary time (optional early compute)
      if (record.id === 'summary') {
         setSubmission(buildReport(nextSub));
         // advance using *nextSub* so skips reflect the computed report if needed
         const j = nextIndexWith(idx, buildReport(nextSub));
         if (j < PIPELINE.length) setIdx(j);
         return;
      }

      // 6) Commit new submission, then advance using *nextSub* (fresh state)
      setSubmission(nextSub);
      const j = nextIndexWith(idx, nextSub);
      if (j < PIPELINE.length) setIdx(j);

      /*
      const vars = { ...submission.vars, ...patchVars };
      let dut = { ...submission.dut };
      let dutPatchedManual = vars.dutPatchedManual === true;

      const haveAllManual =
         vars.manualSelect === true &&
         !!vars.selectedProcess &&
         !!vars.powerA &&
         !!vars.brand;

      if (haveAllManual && !dutPatchedManual) {
         // build a dummy DUT for the report
         const nextDut = buildDummyDut(vars.selectedProcess!, vars.powerA!, vars.brand!);
         dut = nextDut;
         dutPatchedManual = true;
         vars.dutPatchedManual = true;
      }

      // compute verdict at summary time
      console.log('Completing', record.id);
      // prevent duplicates if this step already recorded
      const already = wasCompleted(submission, record.id);
      const steps = already
         ? submission.steps.map(s => s.id === record.id ? record : s)
         : [...submission.steps, record];
      const nextSub: Submission = { 
         ...submission, 
         steps, 
         vars: { 
            ...submission.vars, 
            ...patchVars 
         }, 
         dut 
      };

      if (record.id === 'summary') setSubmission(buildReport(nextSub));
      else setSubmission(nextSub);

      advance();
      */
   };

   const abort = (reason: string) => {
      const record: StepRecord = {
         id: activeId,
         startedAt: dayjs().toISOString(),
         endedAt: dayjs().toISOString(),
         verdict: 'fail',
         notes: [reason],
      };
      setSubmission({ ...submission, steps: [...submission.steps, record] });
      const summaryIndex = PIPELINE.indexOf('summary');
      setIdx(summaryIndex >= 0 ? summaryIndex : idx);
      // Optionally: park controller or jump to summary
      //setIdx(PIPELINE.indexOf('summary'));
      //setActiveId('summary');
   };

   const StepComp = REGISTRY[activeId];
   if (!StepComp) {
      return (
         <Card withBorder p="md">
            <Loader size="sm" />
            <Text mt="sm">Loading step: {activeId}</Text>
         </Card>
      );
   }

   const runtimeProps: StepRuntimeProps = {
      id: activeId,
      role,
      isActive: true,             // admin overview uses false for non-active
      alreadyCompleted: wasCompleted(submission, activeId),
      goBack,
      canGoBack: prevCompletedIndex >= 0,
      submission,
      complete,
      abort,
   };

   return <StepComp {...runtimeProps} />;
}

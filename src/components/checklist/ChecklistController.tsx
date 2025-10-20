import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Loader, Text } from '@mantine/core';

import { REGISTRY, wasCompleted, StepRuntimeProps } from './pipeline'; 
import SkipStep from './SkipStep';

import { nowIso } from '@utils/generalUtils';
import { buildReport } from '@utils/report';

import { Submission, StepId, StepRecord, PIPELINE } from '@/types/checklistTypes'; 
import type { Role } from '@/types/generalTypes';



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
   jumpTo = null 
}: Props) {
   const [idx, setIdx] = useState(0);
   const activeId = PIPELINE[idx];


   useEffect(()=>{
      console.log(`Current: ${idx} - ${activeId}`)
   }, [idx, activeId]);

   // Optional external jump support
   useEffect(() => {
      if (!jumpTo) return;
      const j = PIPELINE.indexOf(jumpTo);
      
      console.log(`"Jumped to Step: "${j}", "${jumpTo}"`);

      if (j >= 0) setIdx(j);
   }, [jumpTo]);


   const nextIndexWith = useCallback((id: number) => {      
      console.log(`Next Step: "${id}"`);
      return Math.min(id + 1, PIPELINE.length - 1);
   }, []);

   const prevCompletedIndex = useMemo(() => {
      let j = idx - 1;
      const completed = new Set(submission.steps.map(s => s.id));
      while (j >= 0) {
         if (completed.has(PIPELINE[j])) return j
         j--;
      }
      return -1;
   }, [idx, submission.steps]);

   const goBack = useCallback(() => {
      if (prevCompletedIndex >= 0) setIdx(prevCompletedIndex);
      console.log(`Returned to Step: "${prevCompletedIndex}"`);
   }, [prevCompletedIndex]);

   
   
   
   
   // construir "submission" para relatório, finalizar processos de step
   const complete = (record: StepRecord, patchVars?: Record<string, any>) => {
      const mergedVars = { ...(submission.vars ?? {}), ...(patchVars ?? {}) };
      // honor an explicit dut in patchVars, but NEVER synthesize or infer here
      const dut = mergedVars.dut ?? submission.dut;

      // Record keeping (replace if already present)
      const already = wasCompleted(submission, record.id);
      const steps = already
         ? submission.steps.map(s => (s.id === record.id ? record : s))
         : [...submission.steps, record];

      // Build submission object
      const nextSub: Submission = {
         ...submission,
         steps,
         vars: mergedVars, 
         dut,
      };

      
      // Optionally compute report when the 'summary' step completes
      if (record.id === 'summary') {
         const built = buildReport(nextSub);
         setSubmission(built);
         setIdx(nextIndexWith(idx));
         return;
      }

      // Commit new submission, advance using *nextSub*
      setSubmission(nextSub);
      setIdx(nextIndexWith(idx));
   };

   const abort = (reason: string) => {
      const record: StepRecord = {
         id: activeId,
         startedAt: nowIso(),
         endedAt: nowIso(),
         verdict: 'fail',
         notes: [reason],
      };
      setSubmission({ ...submission, steps: [...submission.steps, record] });
      const summaryIndex = PIPELINE.indexOf('summary');
      setIdx(summaryIndex >= 0 ? summaryIndex : idx);
   };

   const StepComp = REGISTRY[activeId] ?? SkipStep; // fallback se step não estiver implementado
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
      isActive: true,
      alreadyCompleted: wasCompleted(submission, activeId),
      goBack,
      canGoBack: prevCompletedIndex >= 0,
      submission,
      complete,
      abort,
   };

   return <StepComp {...runtimeProps} />;
}

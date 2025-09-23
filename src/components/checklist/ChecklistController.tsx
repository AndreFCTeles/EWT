import {useState, useEffect, useCallback} from 'react';
import { REGISTRY, PIPELINE, shouldSkip, StepRuntimeProps } from './pipeline';
import { StepId, Submission, StepRecord } from './types';
import { Role } from '@/utils/types';
import { buildReport } from '@/services/report';
import { Card, Loader, Text } from '@mantine/core';

import dayjs from 'dayjs';
import 'dayjs/locale/pt';
dayjs.locale('pt');

type Props = {
   role: Role;
   submission: Submission;
   setSubmission: (s: Submission) => void;
   // Optional: admin “jump to step”
   jumpTo?: StepId | null;
};

export function ChecklistController({ role, submission, setSubmission, jumpTo = null }: Props) {
   const [idx, setIdx] = useState(0);
   const [activeId, setActiveId] = useState<StepId>(PIPELINE[0]);

   // Jump (admin)
   useEffect(() => {
      if (jumpTo && PIPELINE.includes(jumpTo)) {
         setIdx(PIPELINE.indexOf(jumpTo));
         setActiveId(jumpTo);
      }
   }, [jumpTo]);

   // Advance while skipping
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

   const complete = (record: StepRecord) => {
      const steps = [...submission.steps, record];
      const nextSub = { ...submission, steps };
      setSubmission(nextSub);
      // For summary/export you may want to precompute final verdict here
      if (record.id === 'summary') {
         setSubmission(buildReport(nextSub));
      }
      advance();
   };

   const abort = (reason: string) => {
      const steps = [...submission.steps, {
         id: activeId,
         startedAt: dayjs().toISOString(),
         endedAt: dayjs().toISOString(),
         verdict: 'fail',
         notes: [reason],
      } as StepRecord];
      const nextSub = { ...submission, steps };
      setSubmission(nextSub);
      // Optionally: park controller or jump to summary
      setIdx(PIPELINE.indexOf('summary'));
      setActiveId('summary');
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
      submission,
      complete,
      abort,
   };

   return <StepComp {...runtimeProps} />;
}

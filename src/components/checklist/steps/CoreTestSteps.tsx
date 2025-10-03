import React, { useEffect, useState } from 'react';
import { Button, Group, List, Text, Alert } from '@mantine/core';
import dayjs from '@/lib/dayjs-setup';

import { StepShell } from './StepShell';
import type { StepRuntimeProps } from '@/components/checklist/pipeline';
import { verdictFromRanges, pctTolerance, absTolerance } from '@utils/measurement';
import { signals } from '@utils/hardware'; // expect { subscribeInterlocks, measureOCV }
import { Polarity } from '@/types/checklistTypes';





// ---------- Interlocks ----------
export const InterlocksStep: React.FC<StepRuntimeProps> = ( {
   id, 
   alreadyCompleted, 
   canGoBack, 
   goBack, 
   isActive, 
   complete, 
   abort,
} ) => {
   const [state, setState] = useState({
      enclosureClosed: false,
      eStopReleased: false,
      gasOk: true,
      coolantOk: true,
      mainsOk: true,
   });

   useEffect(() => {
      if (!isActive || alreadyCompleted) return;
      const unsub = signals.subscribeInterlocks(s => setState(s as any));
      return unsub;
   }, [isActive, alreadyCompleted]);

   const allOk = state.enclosureClosed && state.eStopReleased && state.mainsOk !== false;

   useEffect(() => {
      if (!isActive || alreadyCompleted) return;
      if (allOk) {
         const t = setTimeout(() => complete({
            id,
            startedAt: dayjs().toISOString(),
            endedAt: dayjs().toISOString(),
            measured: {
               enclosureClosed: Number(state.enclosureClosed),
               eStopReleased: Number(state.eStopReleased),
               mainsOk: Number(state.mainsOk ?? 1),
            },
            verdict: 'pass',
         }), 5000);
         return () => clearTimeout(t);
      }
   }, [allOk, isActive, alreadyCompleted, complete, id, state]);

   return (
      <StepShell
      title="Interlocks & Environment"
      canGoBack={canGoBack}
      onBack={goBack}
      right={!allOk && !alreadyCompleted && <Text c="red">Waiting…</Text>}
      >
         <List>
            <List.Item>Enclosure: {state.enclosureClosed ? 'Closed' : 'Open'}</List.Item>
            <List.Item>E-Stop: {state.eStopReleased ? 'Released' : 'Pressed'}</List.Item>
            <List.Item>Mains: {state.mainsOk ? 'OK' : 'Out of window'}</List.Item>
         </List>
         {!allOk && !alreadyCompleted && (
            <Group mt="md">
               <Button variant="light" color="red" onClick={() => abort('Interlock not satisfied')}>Abort</Button>
            </Group>
         )}
      </StepShell>
   );
};

// ---------- Connections ----------
export const ConnectionsStep: React.FC<StepRuntimeProps> = ( { 
   id, 
   complete, 
   role, 
   abort, 
   isActive 
} ) => {
   const [polarity, setPolarity] = useState<Polarity>('unknown');

   useEffect(() => {
      if (!isActive) return;
      const unsub = signals.subscribeInterlocks(s => setPolarity(s.polarityContinuity ?? 'unknown'));
      return unsub;
   }, [isActive]);

   const canProceed = polarity === 'ok' || (role === 'admin' && polarity !== 'open');

   const onNext = () => {
      complete({
         id,
         startedAt: dayjs().toISOString(),
         endedAt: dayjs().toISOString(),
         measured: { polarityOk: Number(polarity === 'ok') },
         verdict: polarity === 'ok' ? 'pass' : 'warn',
         notes: polarity === 'ok' ? [] : [`Polarity = ${polarity}`],
      });
   };

   return (
      <StepShell title="Connections & Polarity">
         {polarity !== 'ok' && (
            <Alert color="yellow" mb="sm" title="Check connections">
               Current reading: <b>{polarity}</b>. Fix wiring or override (admin).
            </Alert>
         )}
         <Group mt="md">
            <Button onClick={onNext} disabled={!canProceed}>Next</Button>
            <Button variant="light" color="red" onClick={() => abort('Connections invalid')}>Abort</Button>
         </Group>
         {role === 'admin' && <Text size="xs" c="dimmed" mt="xs">Admin may proceed with non-OK polarity except OPEN.</Text>}
      </StepShell>
   );
};

// ---------- OCV ----------
export const OcvStep: React.FC<StepRuntimeProps> = ({ id, complete, isActive }) => {
   const [reading, setReading] = useState<number | null>(null);
   const target = 80; // TODO: populate from specs/submission

   const onMeasure = async () => {
      if (!isActive) return;
      const { voltage } = await signals.measureOCV();
      setReading(voltage);
   };

   const onConfirm = () => {
      if (reading == null) return;

      // Combine abs ±2.0V AND pct ±3% into a tighter intersection
      const passAbs = absTolerance(target, 2.0);
      const passPct = pctTolerance(target, 3);
      const passRange = { min: Math.max(passAbs.min, passPct.min), max: Math.min(passAbs.max, passPct.max) };
      const verdict = verdictFromRanges(reading, passRange);

      complete({
         id,
         startedAt: dayjs().toISOString(),
         endedAt: dayjs().toISOString(),
         commanded: { state: 'no-load' },
         measured: { ocv: reading },
         toleranceUsed: { abs: 2.0, pct: 3, combo: 'intersection' },
         verdict,
      });
   };

   return (
      <StepShell title="OCV / VRD">
         <Group>
            <Button onClick={onMeasure} disabled={!isActive}>Measure OCV</Button>
            {reading != null && <Text>Reading: {reading.toFixed(2)} V (Target {target} V)</Text>}
         </Group>
         <Group mt="md">
            <Button onClick={onConfirm} disabled={reading == null}>Confirm</Button>
         </Group>
      </StepShell>
   );
};

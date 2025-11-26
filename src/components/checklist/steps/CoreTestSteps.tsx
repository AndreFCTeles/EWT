import React, { useEffect, useState } from 'react';
import { Button, Group, List, Text, Alert } from '@mantine/core';

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';
import { 
   verdictFromRanges, 
   pctTolerance, 
   absTolerance 
} from '@utils/measurement';
import { getSpecForDut } from '@utils/specsRepo';
import { nowIso } from '@utils/generalUtils';
import { signals } from '@utils/hardware'; 
import { judge } from '@utils/verdict';

import type { Polarity, Verdict } from '@/types/checklistTypes';
import type { RangeSpec } from '@/types/specsTypes';







// ---------- Interlocks ----------
export const InterlocksStep: React.FC<StepRuntimeProps> = ( {
   id, 
   alreadyCompleted, 
   canGoBack, 
   goBack, 
   isActive, 
   complete, 
   abort,
   submission 
} ) => {
   const [encState, setEncState] = useState({
      enclosureClosed: false,
      eStopReleased: false,
      gasOk: true,
      coolantOk: true,
      mainsOk: true,
   });
   const [enabled, setEnabled] = useState<boolean>(true);


   
   useEffect(() => {
      getSpecForDut({ dut: submission.dut })
         .then(s => setEnabled(s?.interlocks?.enabled !== false))
         .catch(() => setEnabled(true));
   }, [submission.dut]);
   /*
   useEffect(() => {
      let alive = true;
      getSpecForDut({ dut: submission.dut })
         .then((s) => alive && setEnabled(s?.interlocks?.enabled !== false))
         .catch(() => alive && setEnabled(true));
      return () => {
         alive = false;
      };
   }, [submission.dut]);
   */

   useEffect(() => {
      if (!isActive || alreadyCompleted) return;
      const unsub = signals.subscribeInterlocks(s => setEncState(s as any));
      return unsub;
   }, [isActive, alreadyCompleted]);
   /*
   useEffect(() => {
      if (!isActive || alreadyCompleted) return;
      const unsub = signals.subscribeInterlocks((s) => setEncState(s as any));
      return () => { unsub?.(); };
   }, [isActive, alreadyCompleted]);
   */

   useEffect(() => {
      if (!isActive || alreadyCompleted) return;
      if (enabled === false) {
         complete({
            id,
            startedAt: nowIso(),
            endedAt: nowIso(),
            verdict: 'skipped',
            notes: ['Disabled by spec'],
         },{});
      }
   }, [enabled, isActive, alreadyCompleted, complete, id]);



   const allOk = encState.enclosureClosed && encState.eStopReleased && encState.mainsOk !== false;

   useEffect(() => {
      if (!isActive || alreadyCompleted) return;
      if (allOk) {
         const t = setTimeout(() => complete(
            {
               id,
               startedAt: nowIso(),
               endedAt: nowIso(),
               measured: {
                  enclosureClosed: Number(encState.enclosureClosed),
                  eStopReleased: Number(encState.eStopReleased),
                  mainsOk: Number(encState.mainsOk ?? 1),
               },
               verdict: 'pass',
            }
         ), 5000);
         return () => clearTimeout(t);
      }
   }, [allOk, isActive, alreadyCompleted, complete, id, encState]);

   return (
      <StepShell
      title="Interlocks & Environment"
      canGoBack={canGoBack}
      onBack={goBack}
      right={!allOk && !alreadyCompleted && <Text c="red">Waiting…</Text>}
      >
         <List>
            <List.Item>Enclosure: {encState.enclosureClosed ? 'Closed' : 'Open'}</List.Item>
            <List.Item>E-Stop: {encState.eStopReleased ? 'Released' : 'Pressed'}</List.Item>
            <List.Item>Mains: {encState.mainsOk ? 'OK' : 'Out of window'}</List.Item>
         </List>
         {!allOk && !alreadyCompleted && (
            <Group mt="md">
               <Button 
               variant="light" 
               color="red" 
               onClick={() => abort('Interlock not satisfied')}
               >Abort</Button>
            </Group>
         )}
      </StepShell>
   );
};









// ---------- Connections ----------
export const ConnectionsStep: React.FC<StepRuntimeProps> = ( { 
   id, 
   alreadyCompleted, 
   role, 
   canGoBack, 
   goBack, 
   isActive, 
   complete, 
   abort,
   submission 
} ) => {
   const [polarity, setPolarity] = useState<Polarity>('unknown');
   const [allowOverride, setAllowOverride] = useState<boolean>(false);


   
   useEffect(() => {
      getSpecForDut({ dut: submission.dut }).then(s => 
         setAllowOverride(s?.connections?.allowAdminOverride ?? (role === 'admin' || role === 'superadmin'))
      )
   .catch(() => setAllowOverride(role === 'admin' || role === 'superadmin'));
   }, [submission.dut, role]);


   useEffect(() => {
      if (!isActive) return;
      const unsub = signals.subscribeInterlocks(s => setPolarity(s.polarityContinuity ?? 'unknown'));
      return unsub;
   }, [isActive]);

   const canProceed = polarity === 'ok' || (allowOverride && polarity !== 'open');

   const onNext = () => {
      complete(
         {
            id,
            startedAt: nowIso(),
            endedAt: nowIso(),
            measured: { polarityOk: Number(polarity === 'ok') },
            verdict: polarity === 'ok' ? 'pass' : 'warn',
            notes: polarity === 'ok' ? [] : [`Polarity = ${polarity}`],
         }
      );
   };

   return (
      <StepShell 
      title="Connections & Polarity"
      canGoBack={canGoBack} 
      onBack={goBack}>
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
export const OcvStep: React.FC<StepRuntimeProps> = ( { 
   id, 
   alreadyCompleted, 
   canGoBack, 
   goBack, 
   isActive, 
   complete, 
   abort,
   submission 
} ) => {
   const [reading, setReading] = useState<number | null>(null);
   const [range, setRange] = useState<RangeSpec | null>(null);
   const target = 80; // TODO: populate from specs/submission

   
   useEffect(() => {
      getSpecForDut({ dut: submission.dut }).then(s => setRange(s?.ocv?.enabled ? s.ocv.range : null)).catch(() => setRange(null));
   }, [submission.dut]);

   const onMeasure = async () => {
      if (!isActive) return;
      const { voltage } = await signals.measureOCV();
      setReading(voltage);
   };

   const onConfirm = () => {
      if (reading == null) return;

      // Combine abs ±2.0V AND pct ±3% into a tighter intersection    
      // Prefer spec window, else your existing abs+pct intersection
      let verdictStr: Verdict;
      let notes: string[] | undefined;
      if (range) {
         const v = judge(reading, range);
         verdictStr = v.pass ? 'pass' : 'fail';
         notes = v.pass ? undefined : [`OCV ${v.reason} (value=${v.value}, min=${v.min}, max=${v.max})`];
      } else {
         const passAbs = absTolerance(target, 2.0);
         const passPct = pctTolerance(target, 3);
         const passRange = { 
            min: Math.max(passAbs.min, passPct.min), 
            max: Math.min(passAbs.max, passPct.max) 
         };
         const verdict = verdictFromRanges(reading, passRange);
         verdictStr = verdict; // 'pass' | 'fail'
      }

      complete(
         {
            id,
            startedAt: nowIso(),
            endedAt: nowIso(),
            commanded: { state: 'no-load' },
            measured: { ocv: reading },
            toleranceUsed: { 
               kind: 'combo',
               abs: 2.0, 
               pct: 3, 
               //combo: 'intersection' 
            },
            verdict: verdictStr,
            notes,
         }
      );
   };

   return (
      <StepShell 
      title="OCV / VRD"
      canGoBack={canGoBack} 
      onBack={goBack}>
         <Group>
            <Button fullWidth onClick={onMeasure} disabled={!isActive}>Measure OCV</Button>
            {reading != null && <Text>Leitura: {reading.toFixed(2)} V (Target {target} V)</Text>}
         </Group>
         <Group mt="md">
            <Button fullWidth onClick={onConfirm} disabled={reading == null}>Confirm</Button>
         </Group>
      </StepShell>
   );
};

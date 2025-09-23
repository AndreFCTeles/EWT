import React, {useState, useEffect} from 'react';
import { Button, Group, List, Text } from '@mantine/core';
import { StepShell } from './StepShell';
import { signals } from '@/services/signal';
import type { StepRuntimeProps } from '@/components/checklist/pipeline';

import dayjs from 'dayjs';
import 'dayjs/locale/pt';
dayjs.locale('pt');




export const InterlocksStep: React.FC<StepRuntimeProps> = ({ id, complete, abort, isActive }) => {
   const [state, setState] = useState({ 
      enclosureClosed: false, 
      eStopReleased: false, 
      gasOk: true, 
      coolantOk: true, 
      mainsOk: true 
   });

   useEffect(() => {
      if (!isActive) return;
      const unsub = signals.subscribeInterlocks((s) => {
         setState(s as any);
      });
      return unsub;
   }, [isActive]);

   const allOk = state.enclosureClosed && state.eStopReleased && state.mainsOk !== false;

   useEffect(() => {
      if (!isActive) return;
      if (allOk) {
         // auto-complete after a tiny dwell
         const t = setTimeout(() => {
            complete({
               id,
               startedAt: dayjs().toISOString(),
               endedAt: dayjs().toISOString(),
               measured: {
                  enclosureClosed: Number(state.enclosureClosed),
                  eStopReleased: Number(state.eStopReleased),
                  mainsOk: Number(state.mainsOk ?? 1),
               },
               verdict: 'pass',
            });
         }, 5000);
         return () => clearTimeout(t);
      }
   }, [allOk, complete, id, isActive, state]);

   return (
      <StepShell title="Interlocks & Environment" right={!allOk && <Text c="red">Waiting…</Text>}>
         <List>
            <List.Item>Enclosure: {state.enclosureClosed ? 'Closed' : 'Open'}</List.Item>
            <List.Item>E-Stop: {state.eStopReleased ? 'Released' : 'Pressed'}</List.Item>
            <List.Item>Mains: {state.mainsOk ? 'OK' : 'Out of window'}</List.Item>
         </List>
         {!allOk && (
            <Group mt="md">
               <Button variant="light" color="red" onClick={() => abort('Interlock not satisfied')}>Abort</Button>
            </Group>
         )}
      </StepShell>
   );
};

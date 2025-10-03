import React, {useState, useEffect} from 'react';
import { Button, Group, List, Text } from '@mantine/core';
import { StepShell } from './StepShell';
import { signals } from '@/services/utils/signal';
import type { StepRuntimeProps } from '@checklist/pipeline';
import dayjs from '@/lib/dayjs-setup';



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
      mainsOk: true 
   });

   useEffect(() => {
      if (!isActive || alreadyCompleted) return;
      const unsub = signals.subscribeInterlocks((s) => {
         setState(s as any);
      });
      return unsub;
   }, [isActive, alreadyCompleted]);

   const allOk = state.enclosureClosed && state.eStopReleased && state.mainsOk !== false;

   useEffect(() => {
      //console.log(dayjs());
      //console.log(Date.now());
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
            verdict: 'pass'
         }), 5000);
         return () => clearTimeout(t);
      }
   }, [allOk, isActive, alreadyCompleted, complete, id]);

   return (
      <StepShell 
      title="Interlocks & Environment" 
      canGoBack={canGoBack} 
      onBack={goBack} 
      right={!allOk && !alreadyCompleted && <Text c="red">Waiting…</Text>}>
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

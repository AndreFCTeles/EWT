import React, {useState, useEffect} from 'react';
import { Button, Group, Text, Alert } from '@mantine/core';
import { StepShell } from './StepShell';
import { signals } from '@/services/utils/signal';
import type { StepRuntimeProps } from '@checklist/pipeline';
import dayjs from '@/lib/dayjs-setup';






export const ConnectionsStep: React.FC<StepRuntimeProps> = ({ id, complete, role, abort, isActive }) => {
   const [polarity, setPolarity] = useState<'ok' | 'reversed' | 'open' | 'unknown'>('unknown');

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
            <Button 
            variant="light" 
            color="red" 
            onClick={() => abort('Connections invalid')}
            >Abort</Button>
         </Group>
         {role === 'admin' && <Text size="xs" c="dimmed" mt="xs">Admin may proceed with non-OK polarity except OPEN.</Text>}
      </StepShell>
   );
};

import { Button, Group } from '@mantine/core';
import { StepShell } from './StepShell';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { AvailablePowers } from '@/services/generalTypes';
import dayjs from '@/lib/dayjs-setup';

const POWERS: Array<AvailablePowers> = [300,400,500,600];

export const PickPowerStep: React.FC<StepRuntimeProps> = (
   { 
      id, 
      canGoBack, 
      goBack, 
      complete 
   }
) => {
   const pick = (a: AvailablePowers) => {
      const now = dayjs().toISOString();
      complete({
         id, 
         startedAt: now, 
         endedAt: now,
         inputs: { ratedCurrent: a }, 
         verdict: 'pass',
      }, { 
         manualSelect: true, 
         powerA: a 
      });
   };
   return (
      <StepShell title="Select Rated Power" canGoBack={canGoBack} onBack={goBack}>
         <Group mt="xs">
            {POWERS.map(a => <Button key={a} onClick={() => pick(a)}>{a}A</Button>)}
         </Group>
      </StepShell>
   );
};

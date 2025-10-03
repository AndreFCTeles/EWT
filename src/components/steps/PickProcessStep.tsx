import { Button, Group } from '@mantine/core';
import { StepShell } from './StepShell';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { Processes } from '@/services/generalTypes';
import dayjs from '@/lib/dayjs-setup';


const PROCESSES: Processes[] = ['MIG','TIG','MMA'];

export const PickProcessStep: React.FC<StepRuntimeProps> = (
   {
      id, 
      canGoBack, 
      goBack, 
      //submission, 
      complete,
   }
) => {
   const pick = (p: Processes) => {
      const now = dayjs().toISOString();
      complete({
         id, 
         startedAt: now, 
         endedAt: now,
         inputs: { process: p },
         verdict: 'pass',
      }, {
         manualSelect: true,
         selectedProcess: p,
         // set DUT processes so later steps auto-skip by process
         // (single-choice for now; change to multi if needed)
      });
   };

   return (
      <StepShell title="Select Process" canGoBack={canGoBack} onBack={goBack}>
         <Group mt="xs">
            {PROCESSES.map(p => (<Button key={p} onClick={() => pick(p)}>{p}</Button>))}
         </Group>
      </StepShell>
   );
};

import { useEffect, useState } from 'react';
import { Button, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core';

import { StepShell } from './StepShell';
import type { StepRuntimeProps } from '@checklist/pipeline';
import type { AvailablePowers, Processes } from '@/types/generalTypes';
import { fetchBrands } from '@/services/api/epmApi';
import { nowIso } from '@utils/generalUtils';
import { API_URL } from '@/lib/config';







const PROCESSES: Processes[] = ['MIG', 'TIG', 'MMA'];
const POWERS: AvailablePowers[] = [300, 400, 500, 600];



// ---- PickProcess ----
export const PickProcessStep: React.FC<StepRuntimeProps> = ({ id, canGoBack, goBack, complete }) => {
   const pick = (p: Processes) => {
      const now = nowIso();
      complete(
         { 
            id, 
            startedAt: now, 
            endedAt: now, 
            inputs: { process: p }, 
            verdict: 'pass' 
         },
         { 
            manualSelect: true, 
            selectedProcess: p 
         }
      );
   };

   return (
      <StepShell 
      title="Select Process" 
      canGoBack={canGoBack} 
      onBack={goBack}>
         <Group mt="xs">
            {PROCESSES.map(p => (
               <Button key={p} onClick={() => pick(p)}>{p}</Button>
            ))}
         </Group>
      </StepShell>
   );
};






// ---- PickPower ----
export const PickPowerStep: React.FC<StepRuntimeProps> = ({ id, canGoBack, goBack, complete }) => {
   const pick = (a: AvailablePowers) => {
      const now = nowIso();
      complete(
         { 
            id, 
            startedAt: now, 
            endedAt: now, 
            inputs: { ratedCurrent: a }, 
            verdict: 'pass' 
         },
         { 
            manualSelect: true, 
            powerA: a 
         }
      );
   };

   return (
      <StepShell 
      title="Select Rated Power" 
      canGoBack={canGoBack} 
      onBack={goBack}>
         <Group mt="xs">
            {POWERS.map(a => (
               <Button key={a} onClick={() => pick(a)}>{a}A</Button>
            ))}
         </Group>
      </StepShell>
   );
};






// ---- PickBrand ----
export const PickBrandStep: React.FC<StepRuntimeProps> = ({ id, canGoBack, goBack, complete }) => {
   const [brands, setBrands] = useState<string[]>([]);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      let live = true;
      (async () => {
         setLoading(true);
         try {
            const b = await fetchBrands(API_URL);
            if (live) setBrands(b);
         } finally { if (live) setLoading(false); }
      })();
      return () => { live = false; };
   }, []);

   const choose = (brandName: string) => {
      const now = nowIso();
      complete(
         { 
            id, 
            startedAt: now, 
            endedAt: now, 
            inputs: { brand: brandName }, 
            verdict: 'pass' 
         },
         { 
            manualSelect: true, 
            brand: brandName 
         }
      );
   };

   return (
      <StepShell 
      title="Select Brand" 
      canGoBack={canGoBack} 
      onBack={goBack}>
         {loading ? 
            <Stack>
               <Text size="sm">Loading brands…</Text>
               <Loader />
            </Stack> 
         :
            <ScrollArea h={220}>
               <Group wrap="wrap" gap="xs">
                  {brands.map(b => <Button key={b} variant="default" onClick={() => choose(b)}>{b}</Button>)}
               </Group>
            </ScrollArea>
         }
      </StepShell>
   );
};

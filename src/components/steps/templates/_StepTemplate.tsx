import React, { useState } from 'react';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@steps/StepShell';
import { Button, Group, Text } from '@mantine/core';
import dayjs from '@/lib/dayjs-setup';




export const StepTemplate: React.FC<StepRuntimeProps> = ({
   id, submission, role, alreadyCompleted, isActive,
   canGoBack, goBack, complete, abort,
   }) => {
   const [value, setValue] = useState<number | null>(alreadyCompleted ? 123 : null); // stub

   const onFinish = () => {
      const now = dayjs().toISOString();
      complete({
         id,
         startedAt: now,
         endedAt: now,
         inputs: { /* whatever the operator chose */ },
         measured: value != null ? { sample: value } : undefined,
         verdict: 'pass',
      });
   };

   return (
      <StepShell title="New Step" canGoBack={canGoBack} onBack={goBack}>
         <Text size="sm" mb="sm">Explain what to do…</Text>
         <Group mt="md">
            <Button onClick={onFinish} disabled={!isActive}>Next</Button>
            <Button variant="light" color="red" onClick={() => abort('Reason')}>Abort</Button>
         </Group>
      </StepShell>
   );
};
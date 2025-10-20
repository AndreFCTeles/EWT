// src/steps/InfoGateStep.tsx
import { Button, Checkbox, List } from '@mantine/core';
import { useState } from 'react';

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';
import { nowIso } from '@utils/generalUtils';

export const InfoGateStep: React.FC<StepRuntimeProps> = ({ id, isActive, canGoBack, goBack, complete }) => {
   const [ack, setAck] = useState(false);
   if (!isActive) return;

   const done = () =>
      complete(
         { 
            id, 
            startedAt: nowIso(),
            endedAt: nowIso(),
            verdict: 'pass'
         },
         {
            //manualSelect: true, 
            patchVars: { prereqAck: true }
         }
      );
   return (
      <StepShell title="Before you begin" onBack={goBack} canGoBack={canGoBack}>
         {/*<Title order={3}>Prerequisites</Title>*/}
         <List withPadding mb="sm" type="ordered">
            <List.Item>Machine is safe and powers on.</List.Item>
            <List.Item>Load bank & multimeter available and functional.</List.Item>
            <List.Item>Leads/cables in good condition.</List.Item>
         </List>
         <Checkbox label="I have verified these prerequisites" checked={ack} onChange={(e)=>setAck(e.currentTarget.checked)} />
         <Button mt="md" disabled={!ack} onClick={done}>Continue</Button>
      </StepShell>
   );
};

import { Button, Checkbox, List } from '@mantine/core';
import { useState } from 'react';

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';
import { nowIso } from '@utils/generalUtils';






export const InfoGateStep: React.FC<StepRuntimeProps> = ({ id, isActive, canGoBack, goBack, complete }) => {
   const [ack, setAck] = useState(false);
   if (!isActive) return;

   const done = () =>
      complete({ 
         id, 
         startedAt: nowIso(),
         endedAt: nowIso(),
         verdict: 'pass'
      }, { patchVars: { prereqAck: true } });

   return (
      <StepShell title="Antes de começar..." onBack={goBack} canGoBack={canGoBack}>
         <List withPadding mb="sm" type="ordered">
            <List.Item>O equipamento está seguro e ligado.</List.Item>
            <List.Item>A banca de carga e os aparelhos de medição estão disponíveis e funcionais.</List.Item>
            <List.Item>A cablagem está devidamente conectada e em boas condições.</List.Item>
         </List>
         <Checkbox 
         label="Verifiquei estes pré-requesitos" 
         checked={ack} 
         onChange={
            (e)=>setAck(e.currentTarget.checked)
         } />
         <Button mt="md" disabled={!ack} onClick={done}>Continuar</Button>
      </StepShell>
   );
};

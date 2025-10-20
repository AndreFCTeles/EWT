import { Button, Group, } from '@mantine/core'; // Title,
import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';
import { nowIso } from '@utils/generalUtils';

export const ProcedurePickerStep: React.FC<StepRuntimeProps> = ( { 
   id, 
   isActive, 
   canGoBack, 
   goBack, 
   complete }
) => {
   if (!isActive) return;
   const pick = (mode: 'validation' | 'calibration') =>
      complete(
         { 
            id, 
            startedAt: nowIso(), 
            endedAt: nowIso(),
            verdict: 'pass', 
         },
         {
            // manualSelect: true, 
            //patchVars: { mode } 
            mode
         }
      );

   return (
      <StepShell title="Choose procedure" onBack={goBack} canGoBack={canGoBack}>
         {/*<Title order={3}>Procedure</Title>*/}
         {/*<Text c="dimmed" mb="sm">What are we doing this session?</Text>*/}
         <Group>
            <Button onClick={() => pick('validation')}>Validation</Button>
            <Button onClick={() => pick('calibration')}>Calibration</Button>
         </Group>
      </StepShell>
   );
};

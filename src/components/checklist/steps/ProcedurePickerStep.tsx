import { Button, Box } from '@mantine/core';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';
import { nowIso } from '@utils/generalUtils';
import classes from '@/styles/PPButtons.module.css'

export const ProcedurePickerStep: React.FC<StepRuntimeProps> = ( { 
   id, 
   isActive, 
   canGoBack, 
   goBack, 
   complete 
} ) => {
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
            mode
         }
      );

   return (
      <StepShell title="Operação" onBack={goBack} canGoBack={canGoBack}>
         <Box className={classes.PPRoot}>
            <Button 
            className={classes.PPBtn} 
            onClick={() => pick('validation')}
            >Validações</Button>
            <Button 
            className={classes.PPBtn} 
            onClick={() => pick('calibration')}
            >Calibrações</Button>
            <Button 
            className={classes.PPBtn} 
            variant='outline'
            >Fim de linha</Button>
         </Box>
      </StepShell>
   );
};
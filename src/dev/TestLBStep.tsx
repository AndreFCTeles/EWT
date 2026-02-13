import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';
import DevEchoPcbTest from './DevEchoPcbTest';

export const TestLBStep: React.FC<StepRuntimeProps> = ( { 
   canGoBack, 
   goBack, 
} ) => {
   return (
      <StepShell title="Operação" onBack={goBack} canGoBack={canGoBack}>
         <DevEchoPcbTest />
      </StepShell>
   );
};
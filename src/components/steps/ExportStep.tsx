import React from 'react';
import { Button, Code, Group } from '@mantine/core';
import { StepRuntimeProps } from '@/components/checklist/pipeline';
import { buildReport } from '@/services/report';
import { StepShell } from './StepShell';

export const ExportStep: React.FC<StepRuntimeProps> = ({ submission }) => {
   const report = buildReport(submission);
   const json = JSON.stringify(report, null, 2);

   const download = () => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `report-${report.dut.model}-${report.dut.serial}.json`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
   };

   return (
      <StepShell title="Export">
         <Code block style={{ maxHeight: 300, overflow: 'auto' }}>{json}</Code>
         <Group mt="md">
            <Button onClick={download}>Download JSON</Button>
         </Group>
      </StepShell>
   );
};

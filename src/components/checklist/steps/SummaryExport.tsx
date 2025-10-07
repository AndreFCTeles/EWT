import React, { useMemo } from 'react';
import { Table, Button, Group, Code } from '@mantine/core';

import type { StepRuntimeProps } from '@checklist/pipeline';
import { nowIso } from '@utils/generalUtils';
import { buildReport } from '@utils/report';
import { StepShell } from './StepShell';


export const SummaryStep: React.FC<StepRuntimeProps> = ({ submission, complete}) => {//, id 
   const rows = submission.steps.map(s => (
      <Table.Tr key={s.id}>
         <Table.Td>{s.id}</Table.Td>
         <Table.Td>{s.verdict}</Table.Td>
         <Table.Td>{s.notes?.join('; ') ?? ''}</Table.Td>
      </Table.Tr>
   ));

   return (
      <StepShell title="Summary">
         <Table withTableBorder>
            <Table.Thead>
               <Table.Tr>
                  <Table.Th>Step</Table.Th>
                  <Table.Th>Verdict</Table.Th>
                  <Table.Th>Notes</Table.Th>
               </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
         </Table>
         <Group mt="md">
            <Button onClick={() => complete({
               id: 'summary',
               startedAt: nowIso(),
               endedAt: nowIso(),
               verdict: submission.steps.some(s => s.verdict === 'fail') ? 'fail' : 'pass'
            })}>Proceed to Export</Button>
         </Group>
      </StepShell>
   );
};

export const ExportStep: React.FC<StepRuntimeProps> = ({ submission }) => {
   const report = useMemo(() => buildReport(submission), [submission]);
   const json = JSON.stringify(report, null, 2);

   const slug = (s?: string) =>
      (s ?? 'report')
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, '-')
         .replace(/(^-|-$)/g, '');

   const download = () => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = `${slug(report.dut?.prodName)}-${report.reportId ?? Date.now()}.json`;
      a.download = name;
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
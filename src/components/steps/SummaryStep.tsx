import { StepRuntimeProps } from '@/components/checklist/pipeline';
import { StepShell } from './StepShell';
import { Table, Button, Group } from '@mantine/core';
import React from 'react';

export const SummaryStep: React.FC<StepRuntimeProps> = ({ submission, complete, id }) => {
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
            <Table.Thead><Table.Tr><Table.Th>Step</Table.Th><Table.Th>Verdict</Table.Th><Table.Th>Notes</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
         </Table>
         <Group mt="md">
            <Button onClick={() => complete({
               id,
               startedAt: new Date().toISOString(),
               endedAt: new Date().toISOString(),
               verdict: 'pass', // compute stricter rule if needed
            })}>Proceed to Export</Button>
         </Group>
      </StepShell>
   );
};

import React from 'react';
import { Card, List, Text } from '@mantine/core';
import { Submission } from '@/components/checklist/types';

export const AdminHUD: React.FC<{ submission: Submission, importstyle: any }> = ({ submission, importstyle }) => {
   return (
      <Card withBorder miw={280} style={{ ...importstyle}}>
         <Text fw={600} mb="xs">Admin HUD</Text>
         <List size="sm">
            <List.Item>Operator: {submission.header.operator}</List.Item>
            <List.Item>DUT: {submission.dut.model} / {submission.dut.serial}</List.Item>
            <List.Item>Steps done: {submission.steps.length}</List.Item>
         </List>
      </Card>
   );
};

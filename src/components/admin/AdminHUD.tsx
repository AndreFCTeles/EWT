import React from 'react';
import { Card, List, Text } from '@mantine/core';
import { Submission } from '@checklist/checklistTypes';
import FilePicker from '@/components/dialog/FilePicker';

export const AdminHUD: React.FC<{ 
   submission: Submission, 
   importstyle: any, 
   user: string | undefined 
}> = ({ submission, importstyle, user }) => {
   const operator = user ? user : submission.header.operator;

   return (
      <Card withBorder miw={280} style={{ ...importstyle}}>
         <Text fw={600} mb="xs">Painel Admin</Text>
         <List size="sm" mb={'md'}>
            <List.Item>Operador: {/*submission.header.operator*/} {operator}</List.Item>
            <List.Item>DUT: {submission.dut.model} / {submission.dut.serial}</List.Item>
            <List.Item>Passos: {submission.steps.length}</List.Item>
         </List>
         <FilePicker />
      </Card>
   );
};

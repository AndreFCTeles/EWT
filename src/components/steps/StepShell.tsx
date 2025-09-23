import { Card, Group, Text } from '@mantine/core';
import React from 'react';

export const StepShell: React.FC<{ 
   title: string; 
   right?: React.ReactNode; 
   children: React.ReactNode; 
}> = ({ title, right, children }) => (
   <Card withBorder shadow="sm" p="md">
      <Group justify="space-between" mb="xs">
         <Text fw={600}>{title}</Text>
         {right}
      </Group>
      {children}
   </Card>
);

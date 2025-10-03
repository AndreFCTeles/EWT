import { Card, Group, Button, Text } from '@mantine/core';
import React from 'react';

export const StepShell: React.FC<{ 
   title: string; 
   canGoBack?: boolean;
   onBack?: () => void;
   right?: React.ReactNode; 
   children: React.ReactNode; 
}> = ({ title, canGoBack, onBack, right, children }) => (
   <Card withBorder shadow="sm" p="md">
      <Group justify="space-between" mb="xs">
         <Group gap="xs">
            {canGoBack && <Button size="xs" variant="light" onClick={onBack}>Previous</Button>}
            <Text fw={600}>{title}</Text>
         </Group>
         {right}
      </Group>
      {children}
   </Card>
);

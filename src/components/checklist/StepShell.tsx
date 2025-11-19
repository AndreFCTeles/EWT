import { Card, Group, Button, Text } from '@mantine/core';
import React from 'react';

type SSProps = { 
   title?: string; 
   canGoBack?: boolean;
   onBack?: () => void;
   right?: React.ReactNode; 
   children: React.ReactNode; 
}

export const StepShell: React.FC<SSProps> = ( { 
   title, 
   canGoBack, 
   onBack, 
   right, 
   children 
} ) => (
   <Card withBorder shadow="sm" p="md" mih={"100%"} h={"100%"}>
      <Group justify="space-between" mb="xs">
         <Group gap="xs">
            {canGoBack && <Button size="xs" variant="light" onClick={onBack}>Anterior</Button>}
            <Text fw={600}>{title}</Text>
         </Group>
         {right}
      </Group>
      {children}
   </Card>
);
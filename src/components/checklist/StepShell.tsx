import { Card, Group, Stack, Button, Title, ScrollArea } from '@mantine/core';
import React from 'react';

type SSProps = { 
   title?: string; 
   canGoBack?: boolean;
   onBack?: () => void;
   center?: React.ReactNode; 
   right?: React.ReactNode; 
   children: React.ReactNode; 
}

export const StepShell: React.FC<SSProps> = ( { 
   title, 
   canGoBack, 
   onBack, 
   center,
   right, 
   children 
} ) => (
   <Card 
   p={0} 
   h={"100%"}
   mih={"100%"}
   shadow={"sm"}
   withBorder >
      <Group 
      p={"md"}
      mb={"xs"} 
      justify={"space-between"}
      className={"stepShellHeader"} >
         {canGoBack && <Button size="xl" variant="light" onClick={onBack}>Anterior</Button>}
         <Stack>
            <Title order={1} fw={600}>{title}</Title>
            {center}
         </Stack>
         {right}
      </Group>
      <ScrollArea p={"md"}>{children}</ScrollArea>
   </Card>
);
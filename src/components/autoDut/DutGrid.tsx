import React from 'react';
import { Button, Card, Group, Pagination, ScrollArea, Stack, Text } from '@mantine/core';
import { useDutSearch } from './DutSearchContext';

export const DutGrid: React.FC = () => {
   const { loading, filtered, page, pageSize, setPage, onSelect } = useDutSearch();

   if (loading) {
      return <Text size="sm">A carregar perfis e produtos…</Text>;
   }

   if (!filtered.length) {
      return <Text size="sm">Nenhuma correspondência com os filtros atuais.</Text>;
   }

   const totalPages = Math.ceil(filtered.length / pageSize);
   const start = (page - 1) * pageSize;
   const pageSlice = filtered.slice(start, start + pageSize);

   return (
      <Stack gap="xs">
         <ScrollArea h={240}>
            <Group wrap="wrap" gap="xs">
               {pageSlice.map(p => (
                  <Card
                  key={p.origin + '::' + p.sourceId}
                  withBorder
                  padding="xs"
                  radius="md" >
                     <Stack gap={2}>
                        <Text fw={500} size="sm">{p.brand} {p.prodName}</Text>
                        {p.series && (
                           <Text size="xs" c="dimmed">Série {p.series}</Text>
                        )}
                        <Text size="xs" c={p.origin === 'profile' ? 'green' : 'dimmed'}>
                           {p.origin === 'profile' ? 'Perfil (testado)' : 'Catálogo'}
                        </Text>
                        <Button
                        size="xs"
                        variant="light"
                        onClick={() => onSelect(p)}
                        >Selecionar</Button>
                     </Stack>
                  </Card>
               ))}
            </Group>
         </ScrollArea>
         {totalPages > 1 && (
            <Pagination 
            total={totalPages} 
            value={page} 
            onChange={setPage} 
            size="xs" />
         )}
      </Stack>
   );
};

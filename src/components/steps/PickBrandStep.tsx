import { useEffect, useState } from 'react';
import { Button, Group, ScrollArea, Text } from '@mantine/core';
import type { StepRuntimeProps } from '@checklist/pipeline';
//import { getBrands, createBrand } from '@/services/api/api';
import { DB_HOST } from '@/services/generalTypes'; //, Brand, STUBBIER_BRANDS_TYPE
import { StepShell } from './StepShell';
import dayjs from '@/lib/dayjs-setup';
import { fetchBrands } from '@/services/api/epmApi';


export const PickBrandStep: React.FC<StepRuntimeProps> = (
   { 
      id, 
      canGoBack, 
      goBack, 
      complete 
   }
) => {
   const [brands, setBrands] = useState<string[]>([]);
   const [loading, setLoading] = useState(true);
   //const [addOpen, setAddOpen] = useState(false);
   //const [newBrand, setNewBrand] = useState('');


   useEffect(() => {
      let live = true;
      (async () => {
         setLoading(true);
         try {
            const b = await fetchBrands(DB_HOST);
            if (live) setBrands(b);
         } finally { if (live) setLoading(false); }
      })();
      return () => { live = false; };
   }, []);

   const choose = (brandName: string) => {
      const now = dayjs().toISOString();
      complete({
         id, 
         startedAt: now, 
         endedAt: now, 
         inputs: { brand: brandName }, 
         verdict: 'pass',
      }, { 
         manualSelect: true, 
         brand: brandName 
      });
   };

   /*
   const addBrand = async () => {
      if (!newBrand.trim()) return;
      const created = await createBrand(newBrand.trim());
      setBrands(prev => [{ id: created.id, name: created.name }, ...prev]);
      setAddOpen(false);
      setNewBrand('');
      choose(created.name); // auto-select the newly created brand
   };
   */

   /*
   const pick = (brand: string) => {
      const now = dayjs().toISOString();
      complete({
         id, startedAt: now, 
         endedAt: now,
         inputs: { brand }, 
         verdict: 'pass',
      }, { 
         manualSelect: true, 
         brand 
      });
   };
   */


   
   return (
      <StepShell 
      title="Select Brand" 
      canGoBack={canGoBack} 
      onBack={goBack}>
      
         {loading ? 
         <Text size="sm">Loading brands…</Text> :
         <ScrollArea h={220}>
            <Group wrap="wrap" gap="xs">
               {brands.map(b => <Button key={b} variant="default" onClick={() => choose(b)}>{b}</Button>)}
            </Group>
         </ScrollArea>}
         {/*
         <Stack gap="xs">
            {loading && <Text size="sm">Loading brands…</Text>}
            <ScrollArea h={220}>
               <Group wrap="wrap" gap="xs">
                  {brands.map(b => (
                     <Button 
                     key={b.id} 
                     variant="default" 
                     onClick={() => choose(b.name)}
                     >{b.name}</Button>
                  ))}
                  <Button 
                  variant="light" 
                  onClick={() => setAddOpen(true)}
                  >+ Add brand</Button>
               </Group>
            </ScrollArea>
         </Stack>

         <Modal 
         opened={addOpen} 
         onClose={() => setAddOpen(false)} 
         title="Add new brand">
            <Stack>
               <TextInput
               placeholder="Brand name"
               value={newBrand}
               onChange={(e) => setNewBrand(e.currentTarget.value)} />
               <Group justify="end">
                  <Button variant="default" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={addBrand}>Save & Select</Button>
               </Group>
            </Stack>
         </Modal>
         */}
      </StepShell>
   );
};

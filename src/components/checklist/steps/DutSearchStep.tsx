import React from 'react';
import { Stack, TextInput } from '@mantine/core'; // , Select
import type { StepRuntimeProps } from '@checklist/pipeline';
import { DutSearchProvider, useDutSearch } from '@/components/dut/DutSearchContext';
import { DutGrid } from '@/components/dut/DutGrid';
import { nowIso } from '@utils/generalUtils';
import { productToDutFromProfile } from '@utils/dutMapping';
import { StepShell } from '../StepShell';
import { DutProfile } from '@/types/dutProfileTypes';

const DutSearchInner: React.FC<StepRuntimeProps> = ({
   id,
   //role,
   canGoBack,
   goBack,
   apply,      // does NOT navigate
   complete,   // persists + navigates
}) => {
   const { filter, setFilter } = useDutSearch();

   const onSelectProfile = (p: DutProfile) => {
      const when = nowIso();
      const dut = productToDutFromProfile(p);

      // persist DuT and profile selection, but don't force navigation yet
      apply( {
         id,
         startedAt: when,
         endedAt: when,
         verdict: 'pass',
         inputs: { 
            selectedProfile: p.sourceId,
            origin: p.origin 
         },
      }, {
         dut,
         dutProfile: p,
      } );
   };

   const onNext = () => {
      const when = nowIso();
      complete(
         {
            id,
            startedAt: when,
            endedAt: when,
            verdict: 'pass',
         }, {} // nothing extra, we already applied dut & profile on select
      );
   };

   return (
      <StepShell
      //id={id}
      title="Identificação do equipamento sob teste"
      //role={role}
      canGoBack={canGoBack}
      onBack={goBack}
      //onNext={onNext}
      >
         <Stack>
            <TextInput
            label="Marca"
            placeholder="Filtrar por marca…"
            value={filter.brand ?? ''}
            onChange={e => setFilter({ brand: e.currentTarget.value || undefined })}
            />
            <TextInput
            label="Modelo / Série / Texto livre"
            placeholder="Ex.: MIG 404, C/CW…"
            value={filter.text ?? ''}
            onChange={e => setFilter({ text: e.currentTarget.value || undefined })}
            />

            {/* Optional: Selects for categorySub / format based on CategoriasProd */}
            {/* <Select ... onChange={v => setFilter({ categorySub: v ?? undefined })} /> */}

            <DutGrid />
         </Stack>
      </StepShell>
   );
};

// Small wrapper so we can mount the Provider for this step
export const DutSearchStep: React.FC<StepRuntimeProps> = (props) => {
   return (
      <DutSearchProvider onSelect={(p) => {
         // bridge context selection to step apply()
         const { apply } = props;
         const when = nowIso();
         const dut = productToDutFromProfile(p);

         apply( {
            id: props.id,
            startedAt: when,
            endedAt: when,
            verdict: 'pass',
            inputs: { selectedProfile: p.sourceId, origin: p.origin },
         }, {
            dut,
            dutProfile: p,
         } );
      }} >
         <DutSearchInner {...props} />
      </DutSearchProvider>
   );
};

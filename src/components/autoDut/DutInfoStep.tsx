import React, { useState } from 'react';
import { NumberInput, Select, Stack, TextInput } from '@mantine/core';
import type { StepRuntimeProps } from '@checklist/pipeline';
import type { Submission } from '@/types/checklistTypes';
import { nowIso } from '@utils/generalUtils';
import { StepShell } from '../checklist/StepShell';

export const DutInfoStep: React.FC<StepRuntimeProps> = ({
   id,
   role,
   canGoBack,
   goBack,
   submission,
   complete,
}) => {
   const initial = submission.dut ?? {
      prodName: '',
      brand: '',
      series: '',
      processes: [],
      ratedCurrent: undefined,
      format: undefined,
      origin: 'manual',
   };

   const [local, setLocal] = useState(initial);

   const onApplyChange = <K extends keyof typeof local>(key: K, value: (typeof local)[K]) => {
      setLocal(prev => ({ ...prev, [key]: value }));
   };

   const onFinish = () => {
      const when = nowIso();
      complete( {
         id,
         startedAt: when,
         endedAt: when,
         verdict: 'pass',
         inputs: {
            prodName: local.prodName,
            brand: local.brand,
            series: local.series,
         },
      }, { dut: local, } );
   };

   return (
      <StepShell
         //id={id}
         title="Confirmar detalhes do equipamento sob teste"
         //role={role}
         canGoBack={canGoBack}
         onBack={goBack}
         //onNext={onFinish}
      >
         <Stack>
            <TextInput
            label="Marca"
            value={local.brand}
            onChange={e => onApplyChange('brand', e.currentTarget.value)}
            />
            <TextInput
            label="Modelo"
            value={local.prodName}
            onChange={e => onApplyChange('prodName', e.currentTarget.value)}
            />
            <TextInput
            label="Série"
            value={local.series ?? ''}
            onChange={e => onApplyChange('series', e.currentTarget.value)}
            />

            {/* Example extra fields inferred from Profiles/Produtos but editable */}
            <Select
            label="Processo principal"
            data={[
               { value: 'MIG', label: 'MIG/MAG' },
               { value: 'TIG', label: 'TIG' },
               { value: 'MMA', label: 'MMA' },
               { value: 'FEEDER', label: 'Alimentador de fio' },
            ]}
            value={local.processes[0] ?? null}
            onChange={v =>
               onApplyChange('processes', v ? [v as any] : [])
            } />

            {/* OCV, supply, etc. can be split into more fields if you want */}
            <NumberInput
            label="OCV (V)"
            value={(local as any).ocv ?? null}
            onChange={value => {
               const ocv = typeof value === 'number' ? value : null;
               onApplyChange('ratedCurrent', local.ratedCurrent); // placeholder; extend Dut type for ocv
               (local as any).ocv = ocv;
            }} />
         </Stack>
      </StepShell>
   );
};

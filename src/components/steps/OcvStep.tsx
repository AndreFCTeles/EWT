import React, { useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { StepShell } from './StepShell';
import { signals } from '@/services/utils/signal';
import { Tol, verdict as evalVerdict } from '@/services/utils/tolerances';
import type { StepRuntimeProps } from '@checklist/pipeline';
import dayjs from '@/lib/dayjs-setup';


const OCV_TOL: Tol = { kind: 'combo', abs: 2.0, pct: 3 }; // example

export const OcvStep: React.FC<StepRuntimeProps> = ({ id, complete,  isActive }) => {//submission,
   const [reading, setReading] = useState<number | null>(null);
   const target = 80; // for now; later read from submission/specs

   const onMeasure = async () => {
      if (!isActive) return;
      const { voltage } = await signals.measureOCV();
      setReading(voltage);
   };

   const onConfirm = () => {
      if (reading == null) return;
      const v = evalVerdict(reading, target, OCV_TOL);
      complete({
         id,
         startedAt: dayjs().toISOString(),
         endedAt: dayjs().toISOString(),
         commanded: { state: 'no-load' },
         measured: { ocv: reading },
         toleranceUsed: OCV_TOL,
         verdict: v,
      });
   };

   return (
      <StepShell title="OCV / VRD">
         <Group>
            <Button onClick={onMeasure} disabled={!isActive}>Measure OCV</Button>
            {reading != null && <Text>Reading: {reading.toFixed(2)} V (Target {target} V)</Text>}
         </Group>
         <Group mt="md">
            <Button onClick={onConfirm} disabled={reading == null}>Confirm</Button>
         </Group>
      </StepShell>
   );
};

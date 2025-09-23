import React from 'react';
import type { StepId } from '@/components/checklist/types';
import type { StepRuntimeProps } from '@/components/checklist/pipeline';
import { InterlocksStep } from './InterlockStep';
import { ConnectionsStep } from './ConnectionStep';
import { OcvStep } from './OcvStep';
import { SummaryStep } from './SummaryStep';
import { ExportStep } from './ExportStep';

// Register only steps you’ll use in v1
export const StepRegistry: Record<StepId, React.FC<StepRuntimeProps>> = {
   login: () => null,        // stub for now (handled earlier)
   dut: () => null,
   specs: () => null,

   interlocks: InterlocksStep,
   connections: ConnectionsStep,
   selftests: () => null,
   calstatus: () => null,

   ocv: OcvStep,

   'proc:MIG:nominals': () => null,
   'proc:MIG:start': () => null,
   'proc:MIG:sweep': () => null,
   'proc:MIG:pulse': () => null,
   'proc:MIG:thermal': () => null,
   'proc:MIG:gas': () => null,
   'proc:TIG:nominals': () => null,
   'proc:TIG:start': () => null,
   'proc:TIG:sweep': () => null,
   'proc:TIG:pulse': () => null,
   'proc:TIG:thermal': () => null,
   'proc:TIG:gas': () => null,
   'proc:MMA:nominals': () => null,
   'proc:MMA:start': () => null,
   'proc:MMA:sweep': () => null,
   'proc:MMA:thermal': () => null,

   summary: SummaryStep,
   export: ExportStep,
};

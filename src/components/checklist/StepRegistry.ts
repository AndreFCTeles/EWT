import React from 'react';

import type { StepRuntimeProps } from '@/components/checklist/pipeline';
import SkipStep from '@checklist/SkipStep';

import type { StepId } from '@/types/checklistTypes';

// Steps
import { PickProcessStep, PickPowerStep, PickBrandStep } from '@steps/ManualPickSteps';
import { ConnectionsStep, InterlocksStep, OcvStep } from '@steps/CoreTestSteps';
import { DetectDutStep } from '@steps/DetectDutStep';
import { SummaryStep, ExportStep } from '@steps/SummaryExport';



// Script
export const StepRegistry: Record<StepId, React.FC<StepRuntimeProps>> = {

   login:                  SkipStep,        // stub

   specs:                  SkipStep,
   dut:                    SkipStep,
   detectDut:              DetectDutStep,

   pickProcess:            PickProcessStep,
   pickPower:              PickPowerStep,
   pickBrand:              PickBrandStep,

   interlocks:             InterlocksStep,
   connections:            ConnectionsStep,
   selftests:              SkipStep,
   calstatus:              SkipStep,

   ocv:                    OcvStep,

   'proc:MIG:nominals':    SkipStep,
   'proc:MIG:start':       SkipStep,
   'proc:MIG:sweep':       SkipStep,
   'proc:MIG:pulse':       SkipStep,
   'proc:MIG:thermal':     SkipStep,
   'proc:MIG:gas':         SkipStep,
   'proc:TIG:nominals':    SkipStep,
   'proc:TIG:start':       SkipStep,
   'proc:TIG:sweep':       SkipStep,
   'proc:TIG:pulse':       SkipStep,
   'proc:TIG:thermal':     SkipStep,
   'proc:TIG:gas':         SkipStep,
   'proc:MMA:nominals':    SkipStep,
   'proc:MMA:start':       SkipStep,
   'proc:MMA:sweep':       SkipStep,
   'proc:MMA:thermal':     SkipStep,

   summary:                SummaryStep,
   export:                 ExportStep,

};

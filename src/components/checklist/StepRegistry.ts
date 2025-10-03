
import React from 'react';
import type { StepRuntimeProps } from '@checklist/pipeline';
import type { StepId } from '@checklist/checklistTypes';
import { ConnectionsStep } from '@steps/ConnectionStep';
import { InterlocksStep } from '@steps/InterlockStep';
import { DetectDutStep } from '@steps/DetectDutStep';
import { SummaryStep } from '@steps/SummaryStep';
import { ExportStep } from '@steps/ExportStep';
import { OcvStep } from '@steps/OcvStep';
import SkipStep from './SkipStep';
import { PickProcessStep } from '../steps/PickProcessStep';
import { PickPowerStep } from '../steps/PickPowerStep';
import { PickBrandStep } from '../steps/PickBrandStep';



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

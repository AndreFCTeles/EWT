import React from 'react';

import type { StepRuntimeProps } from './pipeline';
import SkipStep from './SkipStep';

import type { StepId } from '@/types/checklistTypes';

// Steps
import { PickProcessStep, PickPowerStep, PickBrandStep } from '@steps/ManualPickSteps';
//import { ConnectionsStep, InterlocksStep, OcvStep } from '@steps/CoreTestSteps';
import { ProcedurePickerStep } from '@steps/ProcedurePickerStep';
import { SummaryStep, ExportStep } from '@steps/SummaryExport';
import { DetectLBStep } from '@steps/DetectLBStep';
import LBCalStep from '@steps/LBCalStep';
//import { DutSearchStep } from '@checklist/steps/DutSearchStep';
import { DutInfoStep } from '@/components/autoDut/DutInfoStep';








// Script
export const STEP_REGISTRY: Record<StepId, React.FC<StepRuntimeProps>> = {
   //login:/*-----------------*/SkipStep, //aproveita para detetar api, not rendered, aguarda LoginModal "success"

   detectPowerBank:/*-------*/DetectLBStep, //auto
   pickProcedure:/*---------*/ProcedurePickerStep,

   //dutSearch:/*-------------*/SkipStep, //DutSearchStep,

   pickProcess:/*-----------*/PickProcessStep,
   pickPower:/*-------------*/PickPowerStep,
   pickBrand:/*-------------*/PickBrandStep,
   //dut:/*-------------------*/DutInfoStep, //DutInfoStep, // nome dut, form com specs principais //caso falhe identificações anteriores

   specs:/*-----------------*/SkipStep,

   interlocks:/*------------*/SkipStep, //InterlocksStep,
   connections:/*-----------*/SkipStep, //ConnectionsStep,
   selftests:/*-------------*/SkipStep,
   calstatus:/*-------------*/SkipStep,
   calibration:/*-----------*/LBCalStep,

   ocv:/*-------------------*/SkipStep, //OcvStep,

   'proc:MIGInv:nominals':/**/SkipStep,
   'proc:MIGInv:start':/*---*/SkipStep,
   'proc:MIGInv:sweep':/*---*/SkipStep,
   'proc:MIGInv:pulse':/*---*/SkipStep,
   'proc:MIGInv:thermal':/*-*/SkipStep,
   'proc:MIGInv:gas':/*-----*/SkipStep,
   'proc:TIG:nominals':/*---*/SkipStep,
   'proc:TIG:start':/*------*/SkipStep,
   'proc:TIG:sweep':/*------*/SkipStep,
   'proc:TIG:pulse':/*------*/SkipStep,
   'proc:TIG:thermal':/*----*/SkipStep,
   'proc:TIG:gas':/*--------*/SkipStep,
   'proc:MMA:nominals':/*---*/SkipStep,
   'proc:MMA:start':/*------*/SkipStep,
   'proc:MMA:sweep':/*------*/SkipStep,
   'proc:MMA:thermal':/*----*/SkipStep,
   "proc:MIGConv:nominals":   SkipStep, 
   "proc:MIGConv:start":/*--*/SkipStep, 
   "proc:MIGConv:sweep":/*--*/SkipStep, 
   "proc:MIGConv:thermal":/**/SkipStep,

   summary:/*---------------*/SummaryStep,
   export:/*----------------*/ExportStep,
};




export const AUTO_COMPONENTS = new Set<React.FC<StepRuntimeProps>>([
   SkipStep,
   DetectLBStep, // as unknown 
   //InterlocksStep as React.FC<StepRuntimeProps>,
]);

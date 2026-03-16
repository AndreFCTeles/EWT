import React from 'react';

import type { StepRuntimeProps } from './pipeline';
//import SkipStep from './SkipStep';

import type { StepId } from '@/types/checklistTypes';

// Steps
import { PickProcessStep, PickPowerStep, PickBrandStep } from '@steps/ManualPickSteps';
import { ProcedurePickerStep } from '@steps/ProcedurePickerStep';
import { SummaryStep, ExportStep } from '@steps/SummaryExport';
import { DetectLBStep } from '@steps/DetectLBStep';
import TflRunnerStep from './steps/TflRunnerStep';
import LBCalStep from '@steps/LBCalStep';
//import { TestLBStep } from '@/dev/TestLBStep';





export type StepVisibility = "visible" | "hidden";

/*
export type StepMeta = {
   visibility: StepVisibility;
   requiresLoadBank?: boolean;   // only affects UI gating
};
export type StepDef = StepMeta & {
   id: StepId;
   //title: string;
   Component: React.FC<StepRuntimeProps>;
};
export type StepDef = {
   id: StepId;
   Component: React.FC<StepRuntimeProps>;
   visibility: StepVisibility;
   // optional future metadata: title, group, etc
};
*/


export type StepDef = {
   id: StepId;
   title: string;
   Component: React.FC<StepRuntimeProps>;

   /** hidden/system steps have no UI */
   visibility: StepVisibility;

   /** purely visual gate (used by controller) */
   requiresLoadBank?: boolean;
};




export const STEP_DEFS: Record<StepId, StepDef> = {
   detectPowerBank: { 
      id: "detectPowerBank",
      title: "Deteção da banca de carga",
      Component: DetectLBStep, 
      visibility: "hidden",
      requiresLoadBank: false,
   },
   //testLBStep: { id: "pickProcedure", Component: TestLBStep, visibility: "visible" },

   pickProcedure: { 
      id: "pickProcedure", 
      title: "Selecionar caminho (Val/Cal ou TFL)",
      Component: ProcedurePickerStep, 
      visibility: "visible" 
   },


   pickProcess: {
      id: "pickProcess",
      title: "Processo de soldadura",
      Component: PickProcessStep,
      visibility: "visible",
   },

   pickPower: {
      id: "pickPower",
      title: "Corrente nominal",
      Component: PickPowerStep,
      visibility: "visible",
   },

   pickBrand: {
      id: "pickBrand",
      title: "Marca",
      Component: PickBrandStep,
      visibility: "visible",
   },

   // placeholder/unimplemented steps are hidden, but they still write StepRecords with verdict "skipped"

   calibration: {
      id: "calibration",
      title: "Validação / Calibração (em carga)",
      Component: LBCalStep,
      visibility: "visible",
      requiresLoadBank: true,
   },

   tfl: {
      id: "tfl",
      title: "Testes fim de linha (TFL)",
      Component: TflRunnerStep,
      visibility: "visible",
      requiresLoadBank: false,
   },

   summary: {
      id: "summary",
      title: "Resumo",
      Component: SummaryStep,
      visibility: "visible",
   },

   export: {
      id: "export",
      title: "Exportar",
      Component: ExportStep,
      visibility: "visible",
   },
};



// Back-compat: existing code expects STEP_REGISTRY: StepId -> Component
export const STEP_REGISTRY: Record<StepId, React.FC<StepRuntimeProps>> = Object.fromEntries(
   Object.entries(STEP_DEFS).map(([id, def]) => [id, def.Component])
) as any;


// Visibility helpers
export const HIDDEN_STEP_IDS = new Set<StepId>(
   (Object.keys(STEP_DEFS) as StepId[]).filter((id) => STEP_DEFS[id].visibility === "hidden")
);

export function isHiddenStep(id: StepId) {
   return STEP_DEFS[id]?.visibility === "hidden";
}

export function requiresLoadBank(id: StepId) {
   return !!STEP_DEFS[id]?.requiresLoadBank;
}
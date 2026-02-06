import type { Submission } from '@/types/checklistTypes';
import type { DutProfile } from '@/types/dutProfileTypes';
import { saveDutProfile } from '@/services/api/dut/dutProfilesRepo';
import { nowIso } from '../src/services/utils/generalUtils';

export function submissionToDutProfile(s: Submission): DutProfile | null {
   const d = s.dut;
   if (!d) return null;
   

   const vars = s.vars ?? {};
   const existing = vars.dutProfile as DutProfile | undefined;
   const base: Partial<DutProfile> = existing ?? {};

   return {
      origin: 'profile',
      sourceId: '', // new entry, let API assign _id
      brand: d.brand,
      prodName: d.prodName,
      series: d.series,
      categoryMain: d.categoryMain,
      categorySub: d.categorySub,
      categorySubSub: d.categorySubSub,
      format: d.format,
      supply: d.supply,
      ocv: (d as any).ocv ?? null,
      updatedAt: nowIso(),
   };
}

export async function persistDutProfileIfOk(s: Submission) {
   // up to you: look at summary step verdict / report
   //if (s.finalVerdict !== 'pass') return;

   
   const summary = s.steps.find(step => step.id === 'summary');
   if (!summary || summary.verdict !== 'pass') return;

   const profile = submissionToDutProfile(s);
   if (!profile) return;

   await saveDutProfile(profile);
}

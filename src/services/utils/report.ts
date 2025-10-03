import { Submission, Verdict } from '@/types/checklistTypes';
//import dayjs from '@/lib/dayjs-setup';
import { nowIso } from './generalUtils';


export function buildReport(sub: Submission) {
   const finalVerdict: Verdict =
      sub.steps.some(s => s.verdict === 'fail') ? 'fail' :
      sub.steps.some(s => s.verdict === 'warn') ? 'warn' : 'pass';

   return {
      ...sub,
      finalVerdict,
      generatedAt: nowIso(),
      version: 1,
   };
}




/*
export function buildReport(s: Submission): Submission {
   // Minimal example: compute final verdict from step verdicts
   //const verdictRank = { pass: 0, warn: 1, fail: 2 } as const;
   const order: Record<NonNullable<Submission['finalVerdict']>, number> = { pass: 0, warn: 1, fail: 2 } as const;

   /*
   const worst = s.steps.reduce<Verdict>((acc, r) =>
      verdictRank[r.verdict] > verdictRank[acc] ? r.verdict : acc, 'pass');
   */

   /*
   const worst = s.steps.reduce<'pass'|'warn'|'fail'>((acc, r) =>
      (order[r.verdict] > order[acc] ? r.verdict : acc), 'pass');

   return {
      ...s,
      finalVerdict: worst,
      reportId: s.reportId ?? `RPT-${nowIso()}`,
   };
}
   */
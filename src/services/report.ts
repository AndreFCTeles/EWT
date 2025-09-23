import { Submission, Verdict } from '@/components/checklist/types';

export function buildReport(sub: Submission) {
   const finalVerdict: Verdict =
      sub.steps.some(s => s.verdict === 'fail') ? 'fail' :
      sub.steps.some(s => s.verdict === 'warn') ? 'warn' : 'pass';

   return {
      ...sub,
      finalVerdict,
      generatedAt: new Date().toISOString(),
      version: 1,
   };
}

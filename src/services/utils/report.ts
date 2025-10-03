import { Submission, Verdict } from '@checklist/checklistTypes';
import dayjs from '@/lib/dayjs-setup';

export function buildReport(sub: Submission) {
   const finalVerdict: Verdict =
      sub.steps.some(s => s.verdict === 'fail') ? 'fail' :
      sub.steps.some(s => s.verdict === 'warn') ? 'warn' : 'pass';

   return {
      ...sub,
      finalVerdict,
      generatedAt: dayjs().toISOString(),
      version: 1,
   };
}

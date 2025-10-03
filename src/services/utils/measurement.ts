import { Tol, Range } from "@/types/generalTypes";
import { Verdict } from "@/types/checklistTypes";



export const pctTolerance = (target: number, pct: number): Range => {
   const delta = Math.abs(target) * (pct / 100);
   return { min: target - delta, max: target + delta };
};

export const absTolerance = (target: number, delta: number): Range => ({
   min: target - Math.abs(delta),
   max: target + Math.abs(delta),
});

export const withinRange = (value: number, { min, max }: Range): boolean =>
   value >= Math.min(min, max) && value <= Math.max(min, max);



export const verdict = (
   reading: number, target: number, tol: Tol
): 'pass' | 'warn' | 'fail' => {
   const within = (d: number) => Math.abs(reading - target) <= d;

   const evalTol = (t: Tol): boolean => {
      switch (t.kind) {
         case 'abs': return within(t.abs);
         case 'pct': return within((t.pct/100) * target);
         case 'combo': return within(t.abs + (t.pct/100) * target);
         case 'piecewise': {
            const rule = t.rules.find(r => target <= r.upTo) ?? t.rules.at(-1);
            return rule ? evalTol(rule.tol) : false;
         }
      }
   };

   return evalTol(tol) ? 'pass' : 'fail'; // add 'warn' logic later if you want a yellow band
}


/** Optional: convert measurement to simple pass/warn/fail buckets. */
export function verdictFromRanges(value: number, passR: Range, warnR?: Range): Verdict {
   if (withinRange(value, passR)) return 'pass';
   if (warnR && withinRange(value, warnR)) return 'warn';
   return 'fail';
}
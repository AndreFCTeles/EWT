import type { SimpleCalibration, SimpleTest } from "@/types/toolCalTypes";

export const getUsableTests = (cal?: SimpleCalibration | null): SimpleTest[] =>
   (cal?.tests ?? []).filter((t) => t.usable !== false);

export const groupByKind = (tests: SimpleTest[]) =>
   tests.reduce<Record<string, SimpleTest[]>>((acc, t) => {
      (acc[t.kind] ||= []).push(t);
      return acc;
   }, {});


export const pickClosestReference = (
   tests: SimpleTest[],
   kind: SimpleTest["kind"],
   target: number,
   onlyUsable = true
) => {
   const pool = tests.filter((t) => t.kind === kind && (!onlyUsable || t.usable !== false));
   if (pool.length === 0) return null;
   return pool.reduce((best, t) =>
      Math.abs(t.reference - target) < Math.abs(best.reference - target) ? t : best
   );
}

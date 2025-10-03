import type { TechnicalData } from '../productTypes'; 
import type { AvailablePowers } from '../generalTypes';

export function findNumber(
   tech: TechnicalData[],
   keys: RegExp[],
   toRated?: boolean
): number | AvailablePowers | undefined {
   const row = tech.find(t => keys.some(k => k.test(t.field)));
   if (!row?.value) return undefined;
   const n = Number(row.value.toString().replace(',', '.').match(/[0-9]+(\.[0-9]+)?/)?.[0]);
   if (!isFinite(n)) return undefined;
   if (!toRated) return n;
   const candidates: AvailablePowers[] = [300,400,500,600];
   return candidates.reduce((best, a) => Math.abs(a - n) < Math.abs(best - n) ? a : best);
}

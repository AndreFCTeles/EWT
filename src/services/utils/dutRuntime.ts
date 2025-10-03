import { Dut } from '@checklist/checklistTypes';
import type { ProductData, ProdCategory } from '../productTypes';
import { Processes, DeviceOrigin, AvailablePowers } from '../generalTypes';

/*
export type DutRuntime = {
   prodName: string;
   brand: string;
   series?: string;
   processes: Processes[];
   ratedCurrent?: AvailablePowers;
   origin: DeviceOrigin;
};
*/

function processesFromCategory(cat?: ProdCategory): Processes[] {
   //const v = cat?.main?.toLowerCase() ?? '';
   const vals: string[] = [];
   let cur: ProdCategory | undefined = cat;

   while (cur) {
      if (cur.main) vals.push(cur.main.toLowerCase());
      if (cur.format) vals.push(cur.format.toLowerCase());
      cur = cur.sub;
   }
   if (vals.some(v => v.includes('maq-mig'))) return ['MIG'];
   if (vals.some(v => v.includes('maq-tig'))) return ['TIG'];
   if (vals.some(v => v.includes('maq-mma'))) return ['MMA'];
   // If you later embed deeper chains in cat.sub, check those too.
   return [];
}

function snapRated(n?: number): AvailablePowers | undefined {
   if (n == null || !isFinite(n)) return;
   const opts: AvailablePowers[] = [300,400,500,600];
   return opts.reduce((best, a) => 
      Math.abs(a - n) < Math.abs(best - n) ? a : best, 
      opts[0]);
}

function ratedFromTechnical(tech: ProductData['technical']): AvailablePowers | undefined {
   const row = (tech ?? []).find(t => /corrente|amper|A\b/i.test(t.field));
   if (!row?.value) return;
   const n = Number(row.value.replace(',', '.').match(/[0-9]+(\.[0-9]+)?/)?.[0]);
   return snapRated(n);
}

export function productToDut(p: ProductData, origin: DeviceOrigin = 'db'): Dut {
   return {
      prodName: p.prodName,
      brand: p.brand,
      series: p.series,
      processes: processesFromCategory(p.category),
      ratedCurrent: ratedFromTechnical(p.technical),
      origin,
   };
}

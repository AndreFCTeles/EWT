import type { ProductData, ProdCategory, TechnicalData } from '@/types/productTypes';
import type { Processes, AvailablePowers } from '@/types/generalTypes';




/** Flatten a ProdCategory chain into a list of values (main/format, deepest first). */
export function getCategoryPath(cat?: ProdCategory): string[] {
   const out: string[] = [];
   let cur: ProdCategory | undefined = cat;
   while (cur) {
      if (cur.main) out.push(String(cur.main));
      if (cur.format) out.push(String(cur.format));
      cur = cur.sub;
   }
   return out;
}



/** Derive welding processes from category values. */
export function deriveProcesses(cat?: ProdCategory): Processes[] {
   const vals = getCategoryPath(cat).map(v => v.toLowerCase());
   const hits = new Set<Processes>();
   if (vals.some(v => v.includes('maq-mig'))) hits.add('MIG');
   if (vals.some(v => v.includes('maq-tig'))) hits.add('TIG');
   if (vals.some(v => v.includes('maq-mma'))) hits.add('MMA');
   return [...hits];
}
/*
export function deriveProcesses(cat?: ProdCategory): Processes[] {
   const vals = categoryPathVals(cat);
   // map your canonical values to processes
   const map: Record<string, Processes> = {
      'maq-mig': 'MIG',
      'maq-tig': 'TIG',
      'maq-mma': 'MMA',
   };
   const hits = vals.map(v => map[v]).filter(Boolean) as Processes[];
   // unique, preserve order
   return [...new Set(hits)];
}
   */


/** Parse a number from free-form text ("25,4 A", "600A", "nominal: 500"). */
export function parseNumberLike(s?: string): number | undefined {
   if (!s) return;

   const cleaned = s.replace(/\s/g, '').replace(',', '.');
   const m = cleaned.match(/-?\d+(\.\d+)?/);

   if (!m) return;
   const n = Number(m[0]);
   return Number.isFinite(n) ? n : undefined;
}




export function deriveFormat(cat?: ProdCategory, topFormat?: ProdCategory): string | undefined {
   // Prefer embedded format in the category tree; otherwise accept top-level ProductData.format?.main/value
   const inTree = getCategoryPath(cat).find(v => v.startsWith('maq-') === false); // crude but OK
   if (inTree) return inTree;
   // If you store format separately as another ProdCategory, pick its .main or .format
   // (Adjust to how you actually supply it)
   return topFormat?.format ?? topFormat?.main;
}





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


/**
 * Find a numeric current in ProductData.technical.
 * Returns a raw number (amps) or undefined. Snapping to discrete powers is done in dut.ts.
 */
export function currentFromTechnical(tech: ProductData['technical']): number | undefined {
   const row = (tech ?? []).find(t => /corrente|amper|A\b/i.test(t.field));
   return parseNumberLike(row?.value);
}
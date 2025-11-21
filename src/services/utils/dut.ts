import { currentFromTechnical, deriveProcesses } from './product';

//import { Processes, DeviceOrigin, AvailablePowers } from '@/types/generalTypes'; // , STUBBIER_BRANDS_TYPE
import type { Process, DeviceOrigin, RatedCurrent } from '@/types/checklistTypes';
import type { ProductData, ProdCategory } from '@/types/productTypes';
import type { Dut } from '@/types/checklistTypes';
import { nowIso } from './generalUtils';



export const ALLOWED_POWERS: RatedCurrent[] = [300, 400, 500, 600];




function defaultCategory(process: Process): ProdCategory {
   const base = { main: 'maq' };
   if (process === 'MIG') return { 
      ...base, 
      sub: { 
         main: 'maq-mig', 
         format: 'maq-mig-f-com',
         sub: { main: 'maq-mig-bas' } 
      } 
   };
   if (process === 'TIG') return { 
      ...base, 
      sub: { 
         main: 'maq-tig', 
         format: 'maq-tig-f-com', 
         sub: { main: 'maq-tig-bas' } 
      } 
   };
   return { 
      ...base, 
      sub: { 
         main: 'maq-mma', 
         format: 'maq-mma-f-com', 
         sub: { main: 'maq-mma-bas' } 
      } 
   };
}


/*
function processesFromCategory(cat?: ProdCategory): Processes[] {
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
*/





export function snapRated(n?: number): RatedCurrent | undefined {
   if (n == null || !Number.isFinite(n)) return;
   return ALLOWED_POWERS.reduce((best, a) => 
      Math.abs(a - n) < Math.abs(best - n) ? a : best, 
      ALLOWED_POWERS[0]);
}


/*
function ratedFromTechnical(tech: ProductData['technical']): AvailablePowers | undefined {
   const row = (tech ?? []).find(t => /corrente|amper|A\b/i.test(t.field));
   if (!row?.value) return;
   const n = Number(row.value.replace(',', '.').match(/[0-9]+(\.[0-9]+)?/)?.[0]);
   return snapRated(n);
}
   */







export function productToDut(p: ProductData, origin: DeviceOrigin = 'db'): Dut {
   return {
      prodName: p.prodName,
      brand: p.brand,
      series: p.series,
      processes: deriveProcesses(p.category),
      ratedCurrent: snapRated(currentFromTechnical(p.technical)),
      origin,
   };
}







export function buildDummyProduct(
   process: Process, 
   powerA: RatedCurrent, 
   brand: string, //STUBBIER_BRANDS_TYPE, 
   //categoryValue?: string, 
   //format?: string
): ProductData {
   const now = nowIso();
   /*
   const category = categoryValue 
      ? ({ main: categoryValue, format } as ProdCategory) 
      : defaultCategory(process);
      */
   return {
      prodName: `${process} ${powerA}A (manual)`,
      brand,
      category: defaultCategory(process),
      technical: [{ 
         field: 'Corrente nominal', 
         value: String(powerA),
         suf: 'A' 
      }],
      description: '',
      applications: '',
      functions: [],
      images: [],
      createdDate: now,
      updatedDate: now,
   };
}



export const dummyToDut = (p: ProductData): Dut => { return productToDut(p, 'manual'); }
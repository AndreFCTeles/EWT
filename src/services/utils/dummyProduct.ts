import type { Processes, AvailablePowers } from '../generalTypes'; // , STUBBIER_BRANDS_TYPE
//import type { ProductDoc, Dut } from '@checklist/checklistTypes';
import { ProductData, ProdCategory } from '../productTypes';
import { productToDut } from './dutRuntime';
import dayjs from '@/lib/dayjs-setup';



function defaultCategory(process: Processes): ProdCategory {
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

export function buildDummyProduct(
   process: Processes, 
   powerA: AvailablePowers, 
   brand: string, //STUBBIER_BRANDS_TYPE, 
   categoryValue?: string, 
   format?: string
): ProductData {
   const now = dayjs().toISOString();
   const category = categoryValue 
      ? ({ main: categoryValue, format } as ProdCategory) 
      : defaultCategory(process);
   return {
      prodName: `${process} ${powerA}A (manual)`,
      brand,
      series: '',
      category,
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

export function dummyToDut(p: ProductData) { return productToDut(p, 'manual'); }






/*
function processToCategory(process: Processes) {
   // keep in sync with your taxonomy
   const main = 'maq';
   if (process === 'MIG') return { 
      main, 
      sub: { 
         main: 'maq-mig', 
         format: 'maq-mig-f-com', 
         sub: { 
            main: 'maq-mig-bas' 
         } 
      } 
   };
   if (process === 'TIG') return { 
      main, 
      sub: { 
         main: 'maq-tig', 
         format: 'maq-tig-f-com', 
         sub: { 
            main: 'maq-tig-bas' 
         } 
      } 
   };
   return { 
      main, 
      sub: { 
         main: 'maq-mma', 
         format: 'maq-mma-f-com', 
         sub: { 
            main: 'maq-mma-bas' 
         } 
      } 
   };
}
   */
/*
export function dummyProductToDut(p: ProductDoc): Dut {
   return {
      prodName: p.prodName,
      brand: p.brand,
      series: p.series,
      processes: ((): Processes[] => {
         const m = p.category?.sub?.main;
         if (m?.includes('mig')) return ['MIG'];
         if (m?.includes('tig')) return ['TIG'];
         if (m?.includes('mma')) return ['MMA'];
         return [];
      })(),
      ratedCurrent: ((): AvailablePowers | undefined => {
         const n = Number(p.technical?.[0]?.value);
         return ([300,400,500,600] as AvailablePowers[]).includes(n as AvailablePowers) ? (n as AvailablePowers) : undefined;
      })(),
      origin: 'manual',
   };
}
*/

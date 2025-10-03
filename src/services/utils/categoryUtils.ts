import type { ProdCategory } from '../productTypes';
import type { Processes } from '../generalTypes';

export function categoryPathVals(cat?: ProdCategory): string[] {
   if (!cat) return [];
   const here = [cat.main, cat.format].filter(Boolean) as string[];
   return cat.sub ? [...here, ...categoryPathVals(cat.sub)] : here;
}

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

export function deriveFormat(cat?: ProdCategory, topFormat?: ProdCategory): string | undefined {
   // Prefer embedded format in the category tree; otherwise accept top-level ProductData.format?.main/value
   const inTree = categoryPathVals(cat).find(v => v.startsWith('maq-') === false); // crude but OK
   if (inTree) return inTree;
   // If you store format separately as another ProdCategory, pick its .main or .format
   // (Adjust to how you actually supply it)
   return topFormat?.format ?? topFormat?.main;
}

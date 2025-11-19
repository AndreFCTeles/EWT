import type { DutProfile } from '@/types/dutProfileTypes';
import type { Submission } from '@/types/checklistTypes';

type DutShape = NonNullable<Submission['dut']>;

export function productToDutFromProfile(p: DutProfile): DutShape {
   return {
      prodName: p.prodName,
      brand: p.brand,
      series: p.series,
      serialno: undefined,
      processes: [],           // can be refined based on category / profile later
      ratedCurrent: undefined,
      format: p.format,
      origin: 'db',            // or 'manual' depending on context
   };
}

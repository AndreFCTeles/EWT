import { useEffect } from 'react';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { probeConnectedLB } from '@utils/hardware';//, lookupProductByHwId
//import { productToDut } from '@utils/dut';
import { nowIso } from '@utils/generalUtils';



export const DetectLBStep: React.FC<StepRuntimeProps> = ({ id, isActive, complete }) => {
   useEffect(() => {
      if (!isActive) return;
      let cancelled = false;

      (async () => {
         const startedAt = nowIso();
         const probe = await probeConnectedLB();
         if (cancelled) return;

         if (!probe.connected) {
            complete({ 
               id, 
               startedAt, 
               endedAt: nowIso(), 
               verdict: 'warn', 
               notes: ['Banca de carga não conectada'] 
            });
            return;
         }

         /*
         const dbproduct = probe.hwId ? await lookupProductByHwId(probe.hwId) : null;
         if (cancelled) return;

         if (!dbproduct) {
            complete({ 
               id, 
               startedAt, 
               endedAt: nowIso(), 
               verdict: 'warn', 
               notes: ['DuT não encontrado na BD'] 
            });
            return;
         }

         const dut = productToDut(dbproduct, 'db');

         complete({ 
            id, 
            startedAt, 
            endedAt: nowIso(), 
            verdict: 'pass' 
         }, { 
            dut, 
            productData: dbproduct 
         });
            */
      })();
      return () => { cancelled = true; };

   }, [id, isActive, complete]);

   return null; // no UI = auto step
};

import { useEffect } from 'react';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { probeConnectedPB, lookupProductByHwId } from '@utils/hardware';
import { productToDut } from '@utils/dut';
import { nowIso } from '@utils/generalUtils';



export const DetectPBStep: React.FC<StepRuntimeProps> = ({ id, isActive, complete }) => {
   useEffect(() => {
      if (!isActive) return;
      let cancelled = false;

      (async () => {
         const startedAt = nowIso();
         const probe = await probeConnectedPB();
         if (cancelled) return;

         if (!probe.connected) {
            complete({ 
               id, 
               startedAt, 
               endedAt: nowIso(), 
               verdict: 'warn', 
               notes: ['DuT não conectado'] 
            });
            return;
         }

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
      })();
      return () => { cancelled = true; };

   }, [id, isActive, complete]);

   return null; // no UI = auto step
};

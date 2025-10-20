import { useEffect } from 'react';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { probeConnectedDut, lookupProductByHwId } from '@utils/hardware';
import { productToDut } from '@utils/dut';
import { nowIso } from '@utils/generalUtils';



export const DetectDutStep: React.FC<StepRuntimeProps> = ({ id, isActive, complete }) => {
   useEffect(() => {
      if (!isActive) return;

      (async () => {
         const startedAt = nowIso();

         const probe = await probeConnectedDut();
         if (!probe.connected) {
            // Not connected → force manual selection
            return complete(
               {
                  id, 
                  startedAt, 
                  endedAt: nowIso(),
                  verdict: 'warn', 
                  notes: ['DUT not connected'],
               }// , { manualSelect: true }
            );
         }

         const dbproduct = probe.hwId ? await lookupProductByHwId(probe.hwId) : null;
         if (!dbproduct) {
            // Connected but unknown → manual selection
            return complete(
               {
                  id, 
                  startedAt, 
                  endedAt: nowIso(),
                  verdict: 'warn', 
                  notes: ['DUT not found in DB'],
               }// , { manualSelect: true }
            );
         }

         const dut = productToDut(dbproduct, 'db');
         return complete({ 
            id, 
            startedAt, 
            endedAt: nowIso(), 
            verdict: 'pass' 
         },{ 
            // manualSelect: false, 
            productData: dbproduct, 
            dut 
         });

      })();
   }, [id, isActive, complete]);

   return null; // no UI; this is an auto step
};

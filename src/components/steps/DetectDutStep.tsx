import { useEffect } from 'react';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { probeConnectedDut, lookupDutByHwId } from '@/services/utils/devices';
import { productToDut } from '@/services/utils/dutRuntime';
import dayjs from '@/lib/dayjs-setup';



export const DetectDutStep: React.FC<StepRuntimeProps> = ({ id, isActive, complete }) => {
   useEffect(() => {
      if (!isActive) return;

      (async () => {
         const startedAt = dayjs().toISOString();

         const probe = await probeConnectedDut();
         if (!probe.connected) {
            // Not connected → force manual selection
            return complete({
               id, startedAt, endedAt: dayjs().toISOString(),
               verdict: 'warn', notes: ['DUT not connected'],
            }, { manualSelect: true });
         }

         const dbproduct = probe.hwId ? await lookupDutByHwId(probe.hwId) : null;
         if (!dbproduct) {
            // Connected but unknown → manual selection
            return complete({
               id, startedAt, endedAt: dayjs().toISOString(),
               verdict: 'warn', notes: ['DUT not found in DB'],
            }, { manualSelect: true });
         }

         
         const dut = productToDut(dbproduct, 'db');
         return complete({ 
            id, startedAt, endedAt: dayjs().toISOString(), 
            verdict: 'pass' 
         },{ manualSelect: false, productData: dbproduct, dut });
         /*
         // Recognized → patch DUT + skip manual picks
         return complete({
            id, startedAt, endedAt: dayjs().toISOString(),
            verdict: 'pass',
            inputs: { hwId: probe.hwId, serial: probe.serial },
         }, {
            manualSelect: false,
            // normalize DUT from DB
            dutPatched: true, // optional marker
         });
         */

      })();
   }, [id, isActive, complete]);

   return null; // no UI; this is an auto step
};

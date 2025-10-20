import type { Submission } from '@/types/checklistTypes';
//import { DEV } from '@/dev/devConfig';
import { nowIso } from '@utils/generalUtils';

// Minimal, safe defaults so the app never crashes on "empty" starts.
// No DUT by default; manual path if forced; steps array always defined.
export function getInitialSubmission(): Submission {
   // const manual = DEV.DETECTION_MODE === 'manual';

   return {
      header: {
         operator: '',       // keep empty; you can fill later in the flow
         station: '',
         appVer: import.meta.env?.VITE_APP_VERSION ?? 'dev',
         templateVer: nowIso().slice(0, 10),
      },
      // STUB DUT
      /*
      dut: { 
         prodName: 'MIG 604 CW', 
         brand: 'ELECTREX',
         series: '4',
         serialno: 'N/D', 
         ratedCurrent: 600,
         processes: ['MIG'],
         origin: 'db'
      },
      */
      dut: undefined,
      instruments: {
         meterId: '',
         meterCal: '',
         lbId: '',
      },
      steps: [],
      //vars: manual ? { manualSelect: true } : {},  // supports your current boolean
   };
}

import type { Submission } from '@/types/checklistTypes';
import { DEV_FORCE_MODE } from '@/dev/devConfig';
import { nowIso } from '@/services/utils/generalUtils';

// Minimal, safe defaults so the app never crashes on "empty" starts.
// No DUT by default; manual path if forced; steps array always defined.
export function getInitialSubmission(): Submission {
   const manual = DEV_FORCE_MODE === 'manual';

   return {
      header: {
         operator: '',       // keep empty; you can fill later in the flow
         station: '',
         appVer: import.meta.env?.VITE_APP_VERSION ?? 'dev',
         templateVer: nowIso().slice(0, 10),
      },
      // No dut: start truly "empty".
      // dut: undefined,
      instruments: {
         meterId: '',
         meterCal: '',
         lbId: '',
      },
      steps: [],
      vars: manual ? { manualSelect: true } : {},  // supports your current boolean
   };
}

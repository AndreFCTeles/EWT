import React, { useEffect, useRef } from "react";
import { nowIso } from "@utils/generalUtils";

import type { StepRuntimeProps } from "@checklist/pipeline";
import { 
   initLoadBankMonitoring, 
   getLoadBankProbeSnapshot 
} from "@/services/hw/loadBankRuntimeStore";

/**
 * Non-blocking detection step:
 * - Starts backend runtime monitoring in the background
 * - Never blocks the UI pipeline if no load bank is connected
 */
export const DetectLBStep: React.FC<StepRuntimeProps> = ({
   id,
   isActive,
   complete,
}) => {

   const ran = useRef(false);

   useEffect(() => {
      if (!isActive) return;
      if (ran.current) return; // StrictMode-safe
      ran.current = true;
      let cancelled = false;

      (async () => {
         // Kick off backend-owned detection/hotplug monitoring
         await initLoadBankMonitoring().catch((e) => {
            console.error("[DetectLBStep] initLoadBankMonitoring error", e);
         });

         if (cancelled) return;

         const snap = getLoadBankProbeSnapshot();

         // Never block: always complete immediately.
         if (!snap.connected) {
            complete(
               {
                  id,
                  startedAt: nowIso(),
                  endedAt: nowIso(),
                  verdict: "warn",
                  notes: ["Banca de carga ainda não foi detetada (monitorização ativa em background)."],
               },
               { loadBank: null }
            );
            return;
         }

         complete(
            {
               id,
               startedAt: nowIso(),
               endedAt: nowIso(),
               verdict: "pass",
               commanded: { action: "lb_runtime_monitoring" },
               notes: [`Banca detetada na porta ${snap.portName}.`],
            },
            {
               loadBank: snap,
               "instruments.lbId": `${snap.bank_power}A-${snap.bank_no}`,
            }
         );
      })();

      return () => { cancelled = true; };
   }, [id, isActive, complete]);

   return null;
};

import React, { useEffect } from 'react';//, useRef, useState
//import { invoke } from "@tauri-apps/api/core";

//import { detectLoadBank } from '@/services/hw/hardware';
import { nowIso } from '@utils/generalUtils';

import type { StepRuntimeProps } from '@checklist/pipeline';
import type { LoadBankProbe, LoadBankStatus } from '@/types/loadBankTypes';
import { 
   DEV_ECHO_ENABLED, 
   DEV_ECHO_PORT,
   DEV_ECHO_POWER, 
   DEV_ECHO_BANK_NO, 
   //DEV_ECHO_BAUD, 
   DEV_ECHO_CONNECTION_HEALTH
} from '@/dev/devConfig'
import { 
   //ensureLoadBankConnected, 
   initLoadBankMonitoring, 
   //getLBState, 
   //subscribeLB
} from '@/services/hw/loadBankRuntimeStore';
//import { startLoadBankPolling } from '@/services/hw/lbProtocol';






export const DetectLBStep: React.FC<StepRuntimeProps> = ( {
   id,
   isActive,
   //alreadyCompleted,
   submission,
   complete,
   //abort,
} ) => {
   /*
   const startedRef = useRef(false);
   const [status, setStatus] = useState<LoadBankStatus | null>(null);
   
   
   useEffect(() => {
      if (startedRef.current) return;
      startedRef.current = true;

      // Main path: just ensure monitoring is running.
      void ensureLoadBankConnected().catch((err) => {
         console.warn("[LB/DetectStep] ensureLoadBankConnected failed", err);
      });

      // Subscribe to store updates
      const unsub = subscribeLB(() => {
         const s = getLBState();
         if (s.portName) {
         setStatus((prev) =>
            prev ? {
               ...prev,
               portName: s.portName!,
               bankPower: s.bankPower ?? prev.bankPower,
               bankNo: s.bankNo ?? prev.bankNo,
               bankHealth: s.bankHealth ?? prev.bankHealth,
            } : null
         );
         }
      });

      // Optional dev fallback: start a quick poll on a known dev echo port.
      // IMPORTANT: this no longer calls lb_stop_polling, to avoid interrupting runtime.
      // If you keep this, only enable it when you are *not* connected to the real load bank.
      void (async () => {
         const st = getLBState();
         if (st.phase === "connected" || st.phase === "probing") return;

         try {
            const ac = new AbortController();
            const stop = await startLoadBankPolling(
               DEV_ECHO_PORT,
               (s) => { setStatus(s); },
               DEV_ECHO_BAUD,
               ac.signal
            );

            // Auto-stop after a short window.
            setTimeout(() => {
               ac.abort();
               void stop();
            }, 800);
         } catch (err) {
            console.warn("[LB/DetectStep] dev fallback failed", err);
         }
      })();

      console.log(status ? `LB: ${status.portName}` : "LB: none")
      return () => {
         unsub();
      };
   }, []);


   useEffect(() => {
      if (!isActive) return;
      let cancelled = false;

      (async () => {
         console.log("[DetectLoadBank] Starting probe...");

         // Ensure runtime poller is not holding the port while we do debug probing. - NOT NEEDED RN
         //await invoke("lb_stop_polling").catch(() => {});

         let probe: LoadBankProbe;
         //let probe = initLoadBankMonitoring();
         //let probe;

         try {
            //probe = await detectLoadBank();
            probe = await initLoadBankMonitoring();
         } catch (err) {
            console.error("[DetectLoadBank] Probe error", err);

            if (cancelled) return;

            complete({
               id,
               startedAt: nowIso(),
               endedAt: nowIso(),
               verdict: "fail",
               notes: [
                  "Erro ao tentar detetar a banca de carga.",
                  String(err),
               ],
            }, { loadBank: null });

            return;
         }

         if (cancelled) return;

         console.log("[DetectLoadBank] Probe result:", probe);


         if (!probe.connected && DEV_ECHO_ENABLED) {

            const devStatus: LoadBankStatus = {
               version: 0,
               bankPower: DEV_ECHO_POWER,
               bankNo: DEV_ECHO_BANK_NO,
               bankHealth: DEV_ECHO_CONNECTION_HEALTH,
               contactorsMask: 0,
               errContactors: 0,
               errFans: 0,
               errThermals: 0,
               otherErrors: 0,
               portName: DEV_ECHO_PORT,
               rawFrameHex: "",
            };

            const devProbe: LoadBankProbe = {
               connected: true,
               portName: DEV_ECHO_PORT,
               status: devStatus,
               bank_power: DEV_ECHO_POWER,
               bank_no: DEV_ECHO_BANK_NO,
               bank_health: DEV_ECHO_CONNECTION_HEALTH
            };

            complete(
               {
                  id,
                  startedAt: nowIso(),
                  endedAt: nowIso(),
                  verdict: "pass",
                  commanded: { action: "probe_load_bank_dev_echo" },
                  notes: [ `DEV: placa shunt usada como banca na porta ${DEV_ECHO_PORT}.` ],
               },
               {
                  loadBank: devProbe,
                  "instruments.lbId": `${DEV_ECHO_POWER}A-${DEV_ECHO_BANK_NO}`,
               }
            );

            return;
         }

         if (!probe.connected) {
            complete({
               id,
               startedAt: nowIso(),
               endedAt: nowIso(),
               verdict: "warn",
               notes: [ "Banca de carga não está ligada ou não foi detetada." ],
            }, { loadBank: null, });
         } else {

            complete({
               id,
               startedAt: nowIso(),
               endedAt: nowIso(),
               verdict: "pass",
               commanded: {
                  // purely informational: "we asked to probe ports"
                  action: "probe_load_bank",
               },
               notes: [ `Banca ${probe.bank_power}A #${probe.bank_no} detetada na porta ${probe.portName}.` ],
            }, {
               loadBank: probe,     // goes into submission.vars.loadBank
               "instruments.lbId": `${probe.bank_power}A-${probe.bank_no}`, // optional
            });
         }
      })();

      return () => { cancelled = true; };
   }, [id, isActive, complete]); // , abort, submission
*/

   useEffect(() => {
      if (!isActive) return;

      //let cancelled = false;

      (async () => {
         console.log("[DetectLBStep] start background monitoring");

         // Start monitoring in the background.
         // This prevents blocking the UI/pipeline at boot if no load bank is connected.
         void initLoadBankMonitoring().catch((err) => {
            console.warn("[DetectLBStep] initLoadBankMonitoring failed", err);
         });

         // DEV: allow dev echo hardware as LB (immediate)
         if (DEV_ECHO_ENABLED) {
            const devStatus: LoadBankStatus = {
               version: 0,
               bankPower: DEV_ECHO_POWER,
               bankNo: DEV_ECHO_BANK_NO,
               bankHealth: DEV_ECHO_CONNECTION_HEALTH,
               contactorsMask: 0,
               errContactors: 0,
               errFans: 0,
               errThermals: 0,
               otherErrors: 0,
               portName: DEV_ECHO_PORT,
               rawFrameHex: "",
            };

            const devProbe: LoadBankProbe = {
               connected: true,
               portName: DEV_ECHO_PORT,
               status: devStatus,
               bank_power: DEV_ECHO_POWER,
               bank_no: DEV_ECHO_BANK_NO,
               bank_health: 0,
            };

            complete(
               {
                  id,
                  startedAt: nowIso(),
                  endedAt: nowIso(),
                  verdict: "pass",
                  commanded: { action: "probe_load_bank_dev_echo" },
                  notes: [`DEV: placa shunt usada como banca na porta ${DEV_ECHO_PORT}.`],
               },
               {
                  loadBank: devProbe,
                  "instruments.lbId": `${DEV_ECHO_POWER}A-${DEV_ECHO_BANK_NO}`,
               }
            );
            return;
         }

         // Normal mode: do not block startup. We record nothing here.
         // Later steps (e.g., LBCalStep) should call ensureLoadBankConnected().
         complete(
            {
               id,
               startedAt: nowIso(),
               endedAt: nowIso(),
               verdict: "pass",
               notes: ["Banca de carga: monitorização iniciada em background."],
            },
            { loadBank: null }
         );
      })();

      //return () => { cancelled = true; };
      return;
   }, [id, isActive, complete, submission]);
   

   // Auto step: no UI, just side-effect.
   return null;
};
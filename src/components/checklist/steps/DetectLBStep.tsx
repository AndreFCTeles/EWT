import { useEffect } from 'react';
import type { StepRuntimeProps } from '@checklist/pipeline';
import { probeConnectedLB } from '@utils/hardware';
import { nowIso } from '@utils/generalUtils';
import type { LoadBankProbe, LoadBankStatus } from '@/types/commTypes';
import { DEV_ECHO_ENABLED, DEV_ECHO_PORT, DEV_ECHO_POWER, DEV_ECHO_BANK_NO } from '@/dev/devConfig'







export const DetectLBStep: React.FC<StepRuntimeProps> = ( {
   id,
   isActive,
   //alreadyCompleted,
   submission,
   complete,
   abort,
} ) => {
   useEffect(() => {
      if (!isActive) return;

      let cancelled = false;

      (async () => {
         console.log("[DetectLoadBank] Starting probe...");

         let probe: LoadBankProbe;
         try {
            probe = await probeConnectedLB();
         } catch (err) {
            console.error("[DetectLoadBank] Probe error", err);

            if (cancelled) return;


            complete({
               id,
               startedAt:nowIso(),
               endedAt:nowIso(),
               verdict: "fail",
               notes: [
                  "Erro ao tentar detetar a banca de carga.",
                  String(err),
               ],
            }, {
               loadBank: null,
            });

            return;
         }

         if (cancelled) return;

         console.log("[DetectLoadBank] Probe result:", probe);


         if (!probe.connected && DEV_ECHO_ENABLED) {

            const devStatus: LoadBankStatus = {
               version: 0,
               bankPower: DEV_ECHO_POWER,
               bankNo: DEV_ECHO_BANK_NO,
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
               startedAt:nowIso(),
               endedAt:nowIso(),
               verdict: "warn",
               notes: [
                  "Banca de carga não está ligada ou não foi detetada.",
               ],
            }, { loadBank: null, });
         } else {

            complete({
               id,
               startedAt:nowIso(),
               endedAt:nowIso(),
               verdict: "pass",
               commanded: {
                  // purely informational: "we asked to probe ports"
                  action: "probe_load_bank",
               },
               notes: [
                  `Banca ${probe.bank_power}A #${probe.bank_no} detetada na porta ${probe.portName}.`,
               ],
            }, {
               loadBank: probe,     // goes into submission.vars.loadBank
               "instruments.lbId": `${probe.bank_power}A-${probe.bank_no}`, // optional
            });
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [id, isActive, complete, abort, submission]);

   // Auto step: no UI, just side-effect.
   return null;
};
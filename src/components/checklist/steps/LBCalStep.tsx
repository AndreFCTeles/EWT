import React, { useEffect, useState, useRef, useMemo } from "react";
import { Button, Group, NumberInput, Stack, Text, Badge } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';

import { 
   generateSetpointsForProcess, 
   resolveLoadBankSetpoint, 
   updateDutyCycleFromMask 
} from "@utils/setpoints";
import { setLoadBankContactors } from "@utils/hardware";
import { startLoadBankPolling } from "@utils/lbProtocol";
import { nowIso } from "@utils/generalUtils";

import type { Dut, Process, Verdict } from "@/types/checklistTypes"; 
import type { LoadBankProbe, LoadBankStatus, SetpointConfig } from "@/types/commTypes";
import { DEV_ECHO_COUNT } from "@/dev/devConfig";



const DEBUG_LBCAL = true;
function dbg(...args: any[]) {
   if (DEBUG_LBCAL) console.log("[LBCalStep]", ...args);
}


export const LBCalStep: React.FC<StepRuntimeProps> = ( {
   id,
   submission,
   isActive,
   //apply, 
   canGoBack, 
   goBack,
   complete,
} ) => {
   if (!isActive) return null;

   // ────────────────────────────────────────────────────────────────────────────
   // Inputs
   // ────────────────────────────────────────────────────────────────────────────
   const vars = submission.vars ?? {};
   const dut = submission.dut as Dut | undefined;
   const process = vars.selectedProcess as Process | undefined;   
   const powerA = vars.powerA as number | undefined;     // from PickPowerStep
   const maxRated = powerA ?? dut?.ratedCurrent ?? null;    // fallback
   const loadBank = vars.loadBank as LoadBankProbe | undefined;

   const hasLoadBank = !!(loadBank && loadBank.connected);
   const portName = loadBank?.connected ? loadBank?.portName ?? "" : "";

   // ────────────────────────────────────────────────────────────────────────────
   // State
   // ────────────────────────────────────────────────────────────────────────────
   const [bankStatus, setBankStatus] = useState<LoadBankStatus | null>(
      loadBank?.connected ? loadBank?.status ?? null : null
   );
   const [hasLiveStatus, setHasLiveStatus] = useState(false);
   const [minSetpoint, setMinSetpoint] = useState<number | null>(null);
   const [setpoints, setSetpoints] = useState<SetpointConfig[]>([]);
   const [optionIndices, setOptionIndices] = useState<Record<number, number>>({});
   const [activeSetpointId, setActiveSetpointId] = useState<number | null>(null);
   const [pendingSetpointId, setPendingSetpointId] = useState<number | null>(null);
   const [busy, setBusy] = useState(false);
   
   // keep a stable stop() so StrictMode / remounts don’t start twice
   const stopPollingRef = useRef<null | (() => Promise<void>)>(null);

   // ────────────────────────────────────────────────────────────────────────────
   // Derived
   // ────────────────────────────────────────────────────────────────────────────
   const missingMessages = useMemo(() => {
      const out: string[] = [];
      if (!process) out.push("Processo de soldadura ainda não foi selecionado.");
      if (!maxRated) out.push("Corrente máxima (potência) do DuT não definida.");
      if (!hasLoadBank) out.push("Banca de carga não está ligada ou não foi detetada.");
      return out;
   }, [process, maxRated, hasLoadBank]);



   // ---- Initial min setpoint heuristic ----
   useEffect(() => {
      if (!maxRated) return void setMinSetpoint(null);

      if (process === "MIGConv") {
         setMinSetpoint(Math.max(5, maxRated * 0.25));
         return;
      } else {
         // 5% of max, at least 5 A
         const fallbackMin = Math.max(5, maxRated * 0.05);

         setMinSetpoint((prev) => {
            // if previous value is valid and still inside [5, max), keep it
            if (
               typeof prev === "number" &&
               prev >= 5 &&
               prev < maxRated
            ) { return prev; }
            return fallbackMin;
         });
      }
   }, [process, maxRated]);


   // Start polling when component mounts
   useEffect(() => {
      if (!hasLoadBank || !portName) return;

      const controller = new AbortController();
      let cancelled = false;

      /*
      startLoadBankPolling(
         portName, 
         s => setBankStatus(s), 
         controller.signal
      ).catch((err) => console.error("[LBCalStep] polling error", err));

      return () => { controller.abort(); };
      */

      (async () => {
         // stop any previous session first (important in dev StrictMode)
         if (stopPollingRef.current) {
            dbg("Stopping previous polling session (StrictMode safety)");
            await stopPollingRef.current();
            stopPollingRef.current = null;
         }

         dbg("Starting polling", { portName });
         const stop = await startLoadBankPolling(
            portName, 
            (s) => {
               setHasLiveStatus(true);
               setBankStatus(s);
               updateDutyCycleFromMask(s.contactorsMask ?? 0);
            }, 
            controller.signal
         );
         if (cancelled) {
            await stop();
            return;
         }
         stopPollingRef.current = stop;
      })().catch((err) => console.error("[LBCalStep] polling error:", err));

      return () => {
         cancelled = true;
         controller.abort();
         if (stopPollingRef.current) {
            void stopPollingRef.current().finally(() => {
               stopPollingRef.current = null;
            });
         }
      };
   }, [hasLoadBank, portName]);

   // ────────────────────────────────────────────────────────────────────────────
   // Generate setpoints (static list). Actual combo will be re-resolved on click.
   // ────────────────────────────────────────────────────────────────────────────
   useEffect(() => {
      if (!process || !maxRated) {
         setSetpoints([]);
         setOptionIndices({});
         setPendingSetpointId(null);
         setActiveSetpointId(null);
         return;
      }

      const currents = generateSetpointsForProcess(
         process,
         minSetpoint ?? undefined,
         maxRated,
         DEV_ECHO_COUNT // number of setpoints
      );

      const configs = currents.map((currentA, idx) =>
         resolveLoadBankSetpoint(idx + 1, process, 0, currentA)
      );

      dbg("Generated setpoints", { 
         process, 
         minSetpoint, 
         maxRated, 
         currents, 
         configs 
      });
      setSetpoints(configs);
      setOptionIndices({});
      setPendingSetpointId(null);
      setActiveSetpointId(null);
   }, [process, minSetpoint, maxRated]);

   // ────────────────────────────────────────────────────────────────────────────
   // Helpers
   // ────────────────────────────────────────────────────────────────────────────
   const notifyMissing = () => {
      if (missingMessages.length) {
         notifications.show({
            color: "orange",
            title: "Faltam dados",
            message: missingMessages.join(" "),
         });
         return true;
      }
      return false;
   };

   const handleFinish = async (verdict: Verdict = "pass") => {
      const now = nowIso();

      complete({
         id,
         startedAt: submission.steps.find((s) => s.id === id)?.startedAt ?? now,
         endedAt: now,
         verdict,
      });
   };

   // ────────────────────────────────────────────────────────────────────────────
   // Click: resolve live combo (duty-budget aware) and apply load bank contactors
   // ────────────────────────────────────────────────────────────────────────────
   const handleSetpointClick = async (sp: SetpointConfig) => {
      if (busy) return;

      dbg("Setpoint click", sp);
      if (notifyMissing()) return;

      setPendingSetpointId(sp.id);

      /*
         if (!hasLoadBank || !portName) return;
         if (!bankStatus) {
      */
      if (!hasLoadBank || !portName || !bankStatus) {
         notifications.show({
            color: "blue",
            title: "Modo UI",
            message: "Banca de carga não disponível. A seleção é apenas visual.",
         });
         setPendingSetpointId(null);
         return;
      }

      // Avoid the “no active polling session” race: require at least one live event
      if (!hasLiveStatus) {
         notifications.show({
            color: "orange",
            title: "A iniciar comunicação",
            message: "A aguardar primeiro estado do polling.",
         });
         setPendingSetpointId(null);
         return;
      }

      if (!process) {
         setPendingSetpointId(null);
         return;
      }

      // Re-resolve at click-time so duty budget affects feasibility & ranking.
      const live = resolveLoadBankSetpoint(sp.id, process, 0, sp.currentA);

      // Keep UI in sync with live labels
      setSetpoints((prev) => prev.map((p) => (p.id === sp.id ? live : p)));

      const idx = optionIndices[sp.id] ?? 0;
      const opt = live.options[idx] ?? live.options[0];

      //const opt = sp.options[0]; // single-option implementation
      if (!opt) {
         notifications.show({
            color: "red",
            title: "Sem combinação",
            message: "Não existe combinação válida para este ponto.",
         });
         setPendingSetpointId(null);
         return;
      }

      // If already active at same mask, do nothing
      if (activeSetpointId === sp.id && (bankStatus.contactorsMask ?? 0) === opt.mask) {
         dbg("Already active with same mask, ignoring", {
            spId: sp.id,
            mask: opt.mask,
         });
         setPendingSetpointId(null);
         return;
      }

      setBusy(true);
      try {
         dbg("Applying contactors OFF -> ON", { spId: sp.id, targetMask: opt.mask });

         // 1) all OFF
         const offStatus = await setLoadBankContactors({
            portName,
            lastStatus: bankStatus,
            contactorsMask: 0x0000,
         });
         setBankStatus(offStatus);
         updateDutyCycleFromMask(offStatus.contactorsMask ?? 0);

         // 2) selected ON
         const newStatus = await setLoadBankContactors({
            portName,
            lastStatus: offStatus,
            contactorsMask: opt.mask,
         });
         setBankStatus(newStatus);
         updateDutyCycleFromMask(newStatus.contactorsMask ?? opt.mask);

         setActiveSetpointId(sp.id);
         dbg("Applied OK", { spId: sp.id, mask: opt.mask });
      } catch (err) {
         console.error("[LBCalStep] auto-apply setpoint failed", err);

         // best-effort fail-safe: try to turn OFF again (don’t block UI if it fails)
         try {
            if (bankStatus) {
               await setLoadBankContactors({
                  portName,
                  lastStatus: bankStatus,
                  contactorsMask: 0x0000,
                  timeoutMs: 1200,
               });
            }
         } catch {}

         setActiveSetpointId(null);
         notifications.show({
            color: "red",
            title: "Falha na banca",
            message: "Falha ao aplicar a carga. Contactores deverão ficar OFF.",
         });
      } finally {
         setBusy(false);
         setPendingSetpointId(null);
      }
   };





  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────
   const rightBadge = hasLoadBank && bankStatus ? (
      <Badge color="green" variant="light">
         Banca {loadBank!.bank_power}A #{loadBank!.bank_no} · {portName}
      </Badge>
   ) : (
      <Badge color="red" variant="light">
         Banca offline
      </Badge>
   );

   return (
      <StepShell 
      title="Calibração" 
      canGoBack={canGoBack} 
      onBack={goBack}
      right={rightBadge}>
         <Stack gap="md">
            <Text fw={600}>Pontos de calibração (corrente)</Text>

            <Group gap="md">
               <NumberInput
               label="Ponto mínimo (A)"
               value={minSetpoint ?? 0}
               onChange={ (val) => {
                  if (typeof val !== "number") return;
                  if (!maxRated) return setMinSetpoint(val);
                  setMinSetpoint(Math.max(0, Math.min(val, maxRated)));
               } }
               min={0}
               max={maxRated ?? undefined}
               disabled={!process || !maxRated || process === "MIGConv"}
               description={
                  process === "MIGConv"
                  ? "MIG Convencional: 25% da corrente máxima"//"MIG Convencional: usa 25%, 50%, 75% e 100% da corrente máxima"
                  : "(ajustável neste passo enquanto não for capturada automaticamente)"
               } />

               <NumberInput
               label="Ponto máximo (A)"
               value={maxRated ?? 0}
               disabled
               description={
                  maxRated
                  ? "Corrente máxima escolhida (PickPower)"
                  : "Selecione a potência no passo anterior"
               } />
            </Group>

            <Group gap="sm" w={"100%"} justify="center">
               {setpoints.map(sp => {
                  const idx = optionIndices[sp.id] ?? 0;
                  const opt = sp.options[idx];
                  const isPending = pendingSetpointId === sp.id;
                  const isActive = activeSetpointId === sp.id;

                  return (
                     <Stack key={sp.id} gap={'xs'} align="center">
                        {opt && (<Text size="xs">{opt.comboLabel}</Text>)}
                        {opt && (<Text size="xs">{opt.errorLabel}</Text>)}
                        {sp.options.length > 1 && (<Text size="xs" c="dimmed">Clique para alternar combinação ({idx + 1}/{sp.options.length})</Text>)}
                        <Button
                        key={`${sp.id}-btn`}
                        h={'auto'}
                        variant={isActive ? "filled" : isPending ? "outline" : "default"}
                        onClick={() => void handleSetpointClick(sp)}
                        loading={busy && isPending}
                        disabled={busy}
                        >
                           <Stack gap={0}>
                              <Text pt={'xs'} size="sm">Ponto {sp.id}:</Text>
                              <Text pb={'xs'}  size="sm">{sp.currentA} A</Text>
                           </Stack>
                        </Button>
                        {isPending && !isActive && (<Text size="xs" c="blue">Pendente (contactores OFF)</Text>)}
                        {isActive && (<Text size="xs" c="green">Ativo (carga aplicada)</Text>)}
                     </Stack>
                  );
               })}
            </Group>


            <Stack gap="sm">
               {/*<Button
               onClick={handleApplyLoad}
               disabled={
                  !process || 
                  !maxRated || 
                  busy
               } >Aplicar carga no ponto selecionado</Button>*/}

               <Button variant="default" onClick={() => handleFinish("pass")}>Concluir calibração</Button>
            </Stack>
         </Stack>
      </StepShell>
   );
};


export default LBCalStep;
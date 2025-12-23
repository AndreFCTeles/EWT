import React, { useEffect, useState, useRef } from "react";
import { Button, Group, NumberInput, Stack, Text, Badge } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';

import { generateSetpointsForProcess, resolveLoadBankSetpoint, updateDutyCycleFromMask } from "@utils/setpoints";
import { setLoadBankContactors } from "@utils/hardware";
import { startLoadBankPolling } from "@utils/lbProtocol";
import { nowIso } from "@utils/generalUtils";

import type { Dut, Process, Verdict } from "@/types/checklistTypes"; 
import type { LoadBankProbe, LoadBankStatus, SetpointConfig } from "@/types/commTypes";
import { DEV_ECHO_COUNT } from "@/dev/devConfig";






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

   const vars = submission.vars ?? {};
   const dut = submission.dut as Dut | undefined;
   const process = vars.selectedProcess as Process | undefined;   
   const powerA = vars.powerA as number | undefined;     // from PickPowerStep
   const maxRated = powerA ?? dut?.ratedCurrent ?? null;    // fallback
   const loadBank = vars.loadBank as LoadBankProbe | undefined;

   const hasLoadBank = !!(loadBank && loadBank.connected);
   const portName = loadBank?.connected ? loadBank?.portName ?? "" : "";


   const [bankStatus, setBankStatus] = useState<LoadBankStatus | null>(loadBank?.connected ? loadBank?.status ?? null : null);
   const [minSetpoint, setMinSetpoint] = useState<number | null>(null);
   const [setpoints, setSetpoints] = useState<SetpointConfig[]>([]);
   const [optionIndices, setOptionIndices] = useState<Record<number, number>>({});
   const [pendingSetpointId, setPendingSetpointId] = useState<number | null>(null);
   const [activeSetpointId, setActiveSetpointId] = useState<number | null>(null);
   const [busy, setBusy] = useState(false);

   //const isOffline = !bankStatus;


   // ---- DERIVED FLAGS / MESSAGES ----
   const missingMessages: string[] = [];
   if (!process) missingMessages.push("Processo de soldadura ainda não foi selecionado.");
   if (!maxRated) missingMessages.push("Corrente máxima (potência) do DuT não definida.");
   if (!hasLoadBank) missingMessages.push("Banca de carga não está ligada ou não foi detetada.");

   
  // keep a stable stop() so StrictMode / remounts don’t start twice
   const stopPollingRef = useRef<null | (() => Promise<void>)>(null);


   // ---- Initial min setpoint heuristic ----
   useEffect(() => {
      /*
         if (!maxRated) {
            setMinSetpoint(null);
            return;
         }
      */
      //same as
      if (!maxRated) return void setMinSetpoint(null);

      if (process === "MIGConv") {
         // For MIGConv we ignore user input; we can show derived 25% value in disabled field
         setMinSetpoint(Math.max(5, maxRated * 0.25));
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
            await stopPollingRef.current();
            stopPollingRef.current = null;
         }

         const stop = await startLoadBankPolling(portName, (s) => setBankStatus(s), controller.signal);
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

   
   // ---- GENERATE SETPOINTS ----
   // ---- Recompute setpoints whenever process / min / max changes ----
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

      setSetpoints(configs);
      setOptionIndices({});
      setPendingSetpointId(null);
      setActiveSetpointId(null);
   }, [process, minSetpoint, maxRated]);



   // ---- HANDLERS ----
   // ---- Select setpoint (pending) & cycle combination options ----
   const handleSetpointClick = async (sp: SetpointConfig) => {
      if (busy) return;
      setPendingSetpointId(sp.id);

      // don’t soft-lock the button by disabling on “pending”
      /*
      if (sp.options.length > 0) {
         setOptionIndices((prev) => {
            const currentIdx = prev[sp.id] ?? -1;
            const nextIdx = (currentIdx + 1) % sp.options.length;
            return { ...prev, [sp.id]: nextIdx };
         });
      }
      */

      // UI-only path (no bank) 
      //if (!hasLoadBank || !portName || !bankStatus) return;
      if (!hasLoadBank || !portName) return;

      if (!bankStatus) {
         notifications.show({
            color: "orange",
            title: "Banca sem status",
            message: "A aguardar primeiro estado válido da banca.",
         });
         return;
      }

      // Safety: you may later check real measured current; for now we at least check contactors
      /*
      const contactorsMask = bankStatus.contactorsMask ?? 0;
      if (contactorsMask !== 0) {
         console.warn( "[LBCalStep] Recusar mudança de ponto enquanto há corrente/contactores ativos." );
         notifications?.show?.({
            color: "orange",
            title: "Contactores ativos",
            message: "Recusar mudança de ponto enquanto há corrente/contactores ativos.",
         });
      }
         */
         
      const opt = sp.options[0]; // single-option implementation
      if (!opt) {
         notifications.show({
         color: "red",
         title: "Sem combinação",
         message: "Não existe combinação válida para este ponto.",
         });
         return;
      }

      // If already active at same mask, do nothing
      if (activeSetpointId === sp.id && (bankStatus.contactorsMask ?? 0) === opt.mask) return;

      setBusy(true);
      try {
         // 1) all OFF
         const offStatus = await setLoadBankContactors({
            portName,
            lastStatus: bankStatus,
            contactorsMask: 0x0000,
         });
         setBankStatus(offStatus);

         // 2) selected ON
         const newStatus = await setLoadBankContactors({
            portName,
            lastStatus: offStatus,
            contactorsMask: opt.mask,
         });
         setBankStatus(newStatus);

         setActiveSetpointId(sp.id);
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
      }
   };


   
   // ---- Apply load for the currently pending setpoint (activate) ----
   /*
   const handleApplyLoad = async () => {
      if (!hasLoadBank || !portName || !bankStatus) {
         console.warn("[LBCalStep] load bank not available, ignoring Apply Load");
         return;
      }
      if (pendingSetpointId == null) {
         console.warn("[LBCalStep] no pending setpoint selected");
         return;
      }

      const sp = setpoints.find((s) => s.id === pendingSetpointId);
      if (!sp) return;

      const idx = optionIndices[sp.id] ?? 0;
      const opt = sp.options[idx];
      if (!opt) {
         console.warn("[LBCalStep] selected setpoint has no resistor option");
         return;
      }

      setBusy(true);
      try {
         // Safety step 1: set all contactors OFF
         const offStatus = await setLoadBankContactors({
            portName,
            lastStatus: bankStatus,
            contactorsMask: 0x0000,
         });
         setBankStatus(offStatus);

         // Safety step 2: apply selected combination
         const newStatus = await setLoadBankContactors({
            portName,
            lastStatus: offStatus,
            contactorsMask: opt.mask,
         });
         setBankStatus(newStatus);
         setActiveSetpointId(sp.id);
      } catch (err) {
         console.error("[LBCalStep] error applying setpoint", err);
         // Mantine notification instead of alert?
         //alert("Falha ao comunicar com a banca de carga.");
         notifications?.show?.({
            color: "red",
            title: "Erro",
            message: "Falha ao comunicar com a banca de carga.",
         });
      } finally {
         setBusy(false);
      }
   };*/


   /** Optional helper to force all contactors OFF */
   /*
   const handleAllOff = async () => {
      if (!hasLoadBank || !portName || !bankStatus) return;
      setBusy(true);
      try {
         const offStatus = await setLoadBankContactors({
            portName,
            lastStatus: bankStatus,
            contactorsMask: 0x0000,
         });
         setBankStatus(offStatus);
         setActiveSetpointId(null);
         setPendingSetpointId(null);
      } catch (err) {
         console.error("[LBCalStep] error turning all contactors OFF", err);
      } finally { setBusy(false); }
   };
   */

   const handleFinish = async (verdict: Verdict = "pass") => {
      const now = nowIso();
      
      //await invoke("close").catch(() => {});
      complete({
         id,
         startedAt: submission.steps.find((s) => s.id === id)?.startedAt ?? now,
         endedAt: now,
         verdict,
      });
   };

   
   const rightBadge = hasLoadBank && bankStatus ? (
      <Badge color="green" variant="light">
         Banca {loadBank.bank_power}A #{loadBank.bank_no} · {portName}
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
               onChange={
                  (val) => {
                     if (typeof val !== "number") return;
                     /*
                     if (!maxRated) {
                        setMinSetpoint(val);
                        return;
                     }
                     const clamped = Math.max(0, Math.min(val, maxRated));
                     setMinSetpoint(clamped);
                     */
                     if (!maxRated) return setMinSetpoint(val);
                     setMinSetpoint(Math.max(0, Math.min(val, maxRated)));
                  }
               }
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
                        onClick={() => handleSetpointClick(sp)}
                        loading={busy}
                        disabled={isPending}
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
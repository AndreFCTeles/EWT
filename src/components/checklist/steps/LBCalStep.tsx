import React, { useEffect, useState } from "react";
import { Button, Group, NumberInput, Stack, Text, Badge } from "@mantine/core";

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';

import { generateSetpointsForProcess, resolveLoadBankSetpoint } from "@utils/setpoints";
import { setLoadBankContactors } from "@utils/hardware";
import { startLoadBankPolling } from "@utils/lbProtocol";
import { nowIso } from "@utils/generalUtils";

import type { Dut, Process, Verdict } from "@/types/checklistTypes"; 
import type { LoadBankProbe, LoadBankStatus, SetpointConfig } from "@/types/commTypes";
import SerialInspectorMini from "@/components/comm/SpeakFFS";





const MIN_CURRENT_FOR_SWITCH = 0.5; // A


//export const LoadBankCalibrationStep: React.FC<Props> = ({ dut, process, portName, minCurrent }) => {

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
   const loadBank = vars.loadBank as LoadBankProbe | undefined;
   const powerA = vars.powerA as number | undefined; // from PickPowerStep

   const hasDut = !!dut;
   const hasProcess = !!process;
   const hasLoadBank = !!loadBank && loadBank.connected;

   // For now, max current comes from PickPowerStep (powerA), falling back to dut.ratedCurrent
   const maxRated = powerA ?? dut?.ratedCurrent ?? 0;

   // Min setpoint is editable here for MMA/TIG/MIGInv; ignored for MIGConv
   const [minSetpoint, setMinSetpoint] = useState<number | null>(null);

   const [bankStatus, setBankStatus] = useState<LoadBankStatus | null>(loadBank?.connected ? loadBank?.status ?? null : null);
   const [setpoints, setSetpoints] = useState<SetpointConfig[]>([]);
   const [pendingSetpointId, setPendingSetpointId] = useState<number | null>(null);
   const [activeSetpointId, setActiveSetpointId] = useState<number | null>(null);
   const [optionIndices, setOptionIndices] = useState<Record<number, number>>({});
   const [busy, setBusy] = useState(false);

   const portName = loadBank?.connected ? loadBank?.portName ?? "" : "";
   //const isOffline = !bankStatus;





   // ---- Initial min setpoint heuristic ----
   useEffect(() => {
      if (!maxRated) return;
      setMinSetpoint((prev) => {
         if (prev !== null) return prev;
         // Default to 25% of max for non-MIGConv to give something reasonable
         if (!process || process === "MIGConv") return Math.round(maxRated * 0.25);
         return Math.round(maxRated * 0.25);
      });
   }, [process, maxRated]);


   // Start polling when component mounts
   useEffect(() => {
      if (!portName) return;

      const controller = new AbortController();
      startLoadBankPolling(
         portName, 
         s => setBankStatus(s), 
         controller.signal
      ).catch((err) => console.error("[LBCalStep] polling error", err));

      return () => { controller.abort(); };
   }, [portName]);

   // ---- Recompute setpoints whenever process / min / max changes ----
   useEffect(() => {
      if (!process || !maxRated) {
         setSetpoints([]);
         setPendingSetpointId(null);
         setActiveSetpointId(null);
         setOptionIndices({});
         return;
      }

      const currents = generateSetpointsForProcess(
         process,
         process === "MIGConv" ? undefined : minSetpoint ?? undefined, // ignore minCurrent if MIGConv
         maxRated,
         4 // number of setpoints
      );

      const configs = currents.map((currentA, idx) =>
         resolveLoadBankSetpoint(idx + 1, process, "1000A", currentA)
      );

      setSetpoints(configs);
      setPendingSetpointId(null);
      setActiveSetpointId(null);
      setOptionIndices({});
   }, [process, minSetpoint, maxRated]);



   // ---- Select setpoint (pending) & cycle combination options ----
   async function handleSetpointClick(sp: SetpointConfig) {
      setPendingSetpointId(sp.id);

      // Always allow UI selection even if we have no load bank or status
      const options = sp.options;
      if (!options.length) return;

      const currentIdx = optionIndices[sp.id] ?? -1;
      const nextIdx = (currentIdx + 1) % options.length;

      setOptionIndices((prev) => ({ ...prev, [sp.id]: nextIdx }));

      // If we don't have a connected bank, stop here (UI-only behaviour)
      if (!hasLoadBank || !bankStatus || !portName) return;

      // Safety: ensure contactors are OFF while operator is preparing this point
      setBusy(true);
      try {
         // Very rough placeholder "current measurement" logic – actual current comes from meter
         const currentMeas =
         bankStatus.contactorsMask === 0 ? 0 : undefined; // "undefined" means unknown

         if (
            currentMeas !== undefined &&
            Math.abs(currentMeas) > MIN_CURRENT_FOR_SWITCH
         ) {
            alert( "Não é permitido mudar de ponto enquanto há corrente. Reduza a corrente para 0 A." );
            setBusy(false);
            return;
         }

         const offStatus = await setLoadBankContactors({
            portName,
            lastStatus: bankStatus,
            contactorsMask: 0x0000,
         });

         setBankStatus({ ...offStatus, portName });
         setActiveSetpointId(null);
      } catch (e) {
         console.error("[LBCalStep] error setting OFF for pending point", e);
         alert("Falha ao comunicar com a banca de carga.");
      } finally {
         setBusy(false);
      }
   }



   
   // ---- Apply load for the currently pending setpoint (activate) ----
   async function handleApplyLoad() {
      if (!hasLoadBank || !bankStatus || !portName) return;
      if (pendingSetpointId == null) {
         alert("Selecione primeiro um ponto de calibração.");
         return;
      }

      const sp = setpoints.find((s) => s.id === pendingSetpointId);
      if (!sp || !sp.options.length) return;

      const optIdx = optionIndices[sp.id] ?? 0;
      const opt = sp.options[optIdx];

      setBusy(true);
      try {
         // MMA: optionally force all OFF before changing contactors
         if (process === "MMA") {
            const offStatus = await setLoadBankContactors({
               portName,
               lastStatus: bankStatus,
               contactorsMask: 0x0000,
            });
            setBankStatus({ ...offStatus, portName });
         }

         const newStatus = await setLoadBankContactors({
            portName,
            lastStatus: bankStatus,
            contactorsMask: opt.mask,
         });

         setBankStatus({ ...newStatus, portName });
         setActiveSetpointId(sp.id);
      } catch (e) {
         console.error("[LBCalStep] error applying load", e);
         alert("Falha ao comunicar com a banca de carga.");
      } finally {
         setBusy(false);
      }
   }



/*
   const handleFinish = (verdict: Verdict = "pass") => {
      const now = nowIso();
      complete({
         id,
         startedAt: submission.steps.find((s) => s.id === id)?.startedAt ?? now,
         endedAt: now,
         verdict,
         // you can also stuff commanded/measured here later
      });
   };
   */
   const handleFinish = (verdict: Verdict = "pass") => {
      const now = nowIso();
      complete({
         id,
         startedAt: submission.steps.find((s) => s.id === id)?.startedAt ?? now,
         endedAt: now,
         verdict,
      });
   };

   const showMissingWarning = !hasDut || !hasProcess || !hasLoadBank || !maxRated;






   return (
      <StepShell 
      title="Calibração" 
      canGoBack={canGoBack} 
      onBack={goBack}
      right={hasLoadBank && bankStatus ? (
         <Badge color="green" variant="light">
            Banca online {bankStatus.bankPower} A / nº {bankStatus.bankNo}
         </Badge>
      ) : (
         <Badge color="red" variant="filled">Banca offline ou não detetada</Badge>
      ) }>
         <Stack gap="md">
            <Text fw={600}>Ajuste manual de pontos de calibração (corrente)</Text>

            <Group gap="md">
               <NumberInput
               label="Ponto mínimo (A)"
               value={minSetpoint ?? 0}
               onChange={(val) => setMinSetpoint(
                  typeof val === "number" && !Number.isNaN(val) ? val : null
               ) }
               min={0}
               max={maxRated || undefined}
               disabled={!process || !maxRated || process === "MIGConv"}
               description={
               process === "MIGConv"
                  ? "MIG Conv usa 25%, 50%, 75% e 100% da corrente máxima"
                  : "(ajustável neste passo enquanto não for capturada da chapa)"
               } />

               <NumberInput
               label="Ponto máximo (A)"
               value={maxRated || undefined}
               disabled
               description={
                  maxRated
                  ? "Corrente máxima escolhida (PickPower)"
                  : "Selecione a potência no passo anterior"
               } />
            </Group>


            {showMissingWarning && (
               <Stack gap={0} align="center">
                  <Text size="sm" c="red">
                     Faltam dados de identificação (DuT, processo ou potência) ou banca.
                  </Text>
                  <Text size="sm" c="red">
                     A UI é apresentada para testes, mas a comunicação pode falhar.
                  </Text>
               </Stack>
            )}

            <Group gap="sm" w={"100%"} justify="center">
               {setpoints.map(sp => {
                  const idx = optionIndices[sp.id] ?? 0;
                  const opt = sp.options[idx];
                  const isPending = pendingSetpointId === sp.id;
                  const isActive = activeSetpointId === sp.id;

                  return (
                     <Stack key={sp.id} gap={'xs'} align="center">
                        {opt && (<Text size="xs">{opt.label} ({opt.errorPercent.toFixed(1)}%)</Text>)}
                        {sp.options.length > 1 && (<Text size="xs" c="dimmed">Clique para alternar combinação ({idx + 1}/{sp.options.length})</Text>)}
                        <Button
                        key={`${sp.id}-btn`}
                        h={'auto'}
                        variant={isActive ? "filled" : isPending ? "outline" : "default"}
                        onClick={() => handleSetpointClick(sp)}
                        loading={busy}
                        //disabled={!process || !maxRated}
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

            <SerialInspectorMini />

            <Stack gap="sm">
               <Button
               onClick={handleApplyLoad}
               disabled={
                  !process || 
                  !maxRated /*|| 
                  pendingSetpointId == null || 
                  busy || 
                  !hasLoadBank*/
               } >Aplicar carga no ponto selecionado</Button>

               <Button variant="default" onClick={() => handleFinish("pass")}>Concluir calibração</Button>
            </Stack>
         </Stack>
      </StepShell>
   );
};


export default LBCalStep;
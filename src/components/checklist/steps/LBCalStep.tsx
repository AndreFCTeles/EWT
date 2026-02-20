import React, { useEffect, useState, useRef, useMemo } from "react";
import { Button, NumberInput, Title, Text, Badge, SimpleGrid, Flex, ScrollArea, Box } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBolt } from "@tabler/icons-react";//, IconInfoSmall

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';

import { 
   generateSetpointsForProcess, 
   resolveLoadBankSetpoint, 
   updateDutyCycleFromMask 
} from "@utils/setpoints";
import SetpointButton from "@/components/setpoints/setpointsSelector";

import { applyLoadBankMaskSequence, setLoadBankContactors } from "@/services/hw/hardware";
import { startLoadBankPolling } from "@/services/hw/lbProtocol";
import { nowIso } from "@utils/generalUtils";

import type { Dut, Process, Verdict } from "@/types/checklistTypes"; 
import type { LoadBankProbe, LoadBankStatus } from "@/types/loadBankTypes";
import type { SetpointConfig } from "@/types/calibrationTypes";
import { DEV_ECHO_BAUD, DEV_ECHO_COUNT } from "@/dev/devConfig";

import DevEchoPcbTest from "@/dev/DevEchoPcbTest";



const DEBUG_LBCAL = true;
function dbg(...args: any[]) {
   if (DEBUG_LBCAL) console.log("[LBCalStep]", ...args);
}












const LBCalStep: React.FC<StepRuntimeProps> = ( {
   id,
   submission,
   isActive,
   apply, 
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
   const minPowerA = vars.minPowerA as number | undefined;     
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
   const [minSetpoint, setMinSetpoint] = useState<number | undefined | null>(minPowerA);
   const [setpoints, setSetpoints] = useState<SetpointConfig[]>([]);
   const [optionIndices, setOptionIndices] = useState<Record<number, number>>({});
   const [activeSetpointId, setActiveSetpointId] = useState<number | null>(null);
   const [pendingSetpointId, setPendingSetpointId] = useState<number | null>(null);
   const [busy, setBusy] = useState(false);

   const [POWER, setPOWER] = useState(false);
   const togglePOWER = () => setPOWER(!POWER);


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
            DEV_ECHO_BAUD,
            controller.signal, // abortSignal
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

         /* old, manual
         // all OFF
         const offStatus = await setLoadBankContactors({
            portName,
            lastStatus: bankStatus,
            contactorsMask: 0x0000,
         });
         setBankStatus(offStatus);
         updateDutyCycleFromMask(offStatus.contactorsMask ?? 0);

         // selected ON
         const newStatus = await setLoadBankContactors({
            portName,
            lastStatus: offStatus,
            contactorsMask: opt.mask,
         });
         */
            
         // Use centralized sequence to apply the new mask safely
         const newStatus = await applyLoadBankMaskSequence({
            portName,
            currentStatus: bankStatus,
            targetMask: opt.mask
         });
         setBankStatus(newStatus);
         updateDutyCycleFromMask(newStatus.contactorsMask ?? opt.mask);
         setActiveSetpointId(sp.id);
         dbg("Applied OK", { spId: sp.id, mask: opt.mask });
      } catch (err) {
         console.error("[LBCalStep] auto-apply setpoint failed", err);

         // fail-safe: try to turn OFF again (don’t block UI if it fails)
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

         notifications.show({
            color: "red",
            title: "Falha na banca",
            message: "Falha ao aplicar a carga. Contactores deverão ficar OFF.",
         });
         setActiveSetpointId(null);
      } finally {
         setBusy(false);
         setPendingSetpointId(null);
      }
   };












  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

   // Badge
   const statusBadge = hasLoadBank && bankStatus ? (
      <Badge color="green" variant="light">
         Banca {loadBank!.bank_power}A #{loadBank!.bank_no} · {portName}
      </Badge>
   ) : (
      <Badge color="red" variant="light">
         Banca offline
      </Badge>
   );
   
   // Resistor Combo display
   const displayResistors = (r:string[]) => {
      const active = new Set(r);

      return <SimpleGrid cols={4} spacing={"1px"} verticalSpacing={"1px"}>
         {Array.from({ length: 8 }, (_, k) => {
            const id = `R${k+ 1}`;         
            const isOn = active.has(id);
            return (
               <Flex 
               key={`resistor-${id}`}
               className="resistorDisplay"
               align={"center"}
               justify={"center"}
               mb={0} 
               pb={0} 
               style={{
                  borderColor:isOn?"rgba(64, 192, 87, 1)":"rgba(128, 128, 128, 0.2)",
                  color:isOn?"rgba(64, 192, 87, 1)":"rgba(128, 128, 128, 0.2)",
               }} >{id}</Flex> 
            );
         })}
      </SimpleGrid>  
   };

   // Setpoint area headers
   const Headers = () => (
      <SimpleGrid cols={2} spacing={"5px"} verticalSpacing={"5px"}>
         <Title order={5} ta={"center"} c={"dimmed"}>PONTOS</Title>
         <SimpleGrid cols={2}>
            <Title order={5} ta={"center"} c={"dimmed"}>CONTROLADOR</Title>   
            <Title order={5} ta={"center"} c={"dimmed"}>FERRAMENTA</Title>   
         </SimpleGrid>
      </SimpleGrid>
   );

   // NEXT
   const NextBTN = () => ( 
      <Button 
      size="xl"
      onClick={() => handleFinish("pass")}
      >Concluir calibração</Button>
   )



   return (
      <StepShell 
      title="Calibração" 
      canGoBack={canGoBack} 
      onBack={()=> {
         apply({
            id,
            startedAt: nowIso(), 
            endedAt: nowIso(),
            verdict: 'pass' 
         },{minPowerA: minSetpoint})
         goBack()
      }}
      center={statusBadge}
      right={NextBTN()}>
         <Flex 
         direction={"column"}
         gap="md" 
         p={0}
         m={0}
         h={"100%"}
         mih={"100%"}
         //align="space-evenly"
         >

            {/* Min, POWER */}
            <SimpleGrid 
            w={"100%"} 
            p={0}
            m={0}
            cols={2}>
               <NumberInput
               w={"70%"}
               m={"auto"}
               suffix={" A"}
               size="md"
               min={0}
               max={maxRated ?? undefined}
               stepHoldDelay={500}
               stepHoldInterval={10}
               label={"Ponto mínimo (A)"}
               value={minSetpoint ?? 0}
               disabled={!process || !maxRated || process === "MIGConv"}
               onChange={ (val) => {
                  if (typeof val !== "number") return;
                  if (!maxRated) return setMinSetpoint(val);
                  setMinSetpoint(Math.max(0, Math.min(val, maxRated)));
               } }
               description={
                  process === "MIGConv"
                  ? "MIG Convencional: 25% da corrente máxima"//"MIG Convencional: usa 25%, 50%, 75% e 100% da corrente máxima"
                  : "(ajustável enquanto não for capturada automaticamente)"
               } />

               <Flex 
               gap={0}
               w={"100%"} 
               direction={"column"} 
               justify={"center"} 
               align={"center"} 
               >
                  <Button
                  h={"100%"}
                  p={"md"}
                  fullWidth
                  onClick={togglePOWER}
                  color={POWER?"red":"green"}
                  disabled={
                     !process || 
                     !maxRated || 
                     busy
                  } >
                     <Flex direction={"column"} align={"center"}>
                        <Text className="POWERLABEL">{POWER?"SUSPENDER":"APLICAR CARGA"}</Text>
                        <IconBolt size={100} />
                     </Flex>
                  </Button> {/* usar IconFlame when cooldown */}
               </Flex>
            </SimpleGrid>


            {/* Setpoint Selectors */}
            <ScrollArea>
               <Flex direction={"column"}>

                  <SimpleGrid cols={{base:1, lg:2}} spacing={"20px"} verticalSpacing={"20px"}>
                     {setpoints.map((sp, index) => {
                        const idx = optionIndices[sp.id] ?? 0;
                        const opt = sp.options[idx];
                        const isPending = pendingSetpointId === sp.id;
                        const isActive = activeSetpointId === sp.id;

                        const showBaseHeader = index === 0; 
                        const showMdHeader = index < 2;

                        return (
                           <Box key={sp.id}>
                              {/* Headers */}
                              {showBaseHeader && ( <Box hiddenFrom="lg"><Headers /></Box> )}
                              {showMdHeader && ( <Box visibleFrom="lg"><Headers /></Box> )}

                              <SimpleGrid cols={2} spacing={"5px"} verticalSpacing={"5px"}>
                                 {/*opt && ( <Text size="xs" mb={0} pb={0} lh={"100%"}>{opt.comboLabel}</Text>)*/} {/* caso queira mostrar a string com combo */} 

                                 <SetpointButton 
                                 key={`setpoint-${sp.id}`}
                                 ampsText={`${sp.currentA} A`}
                                 setpointLine={opt.errorLabel[6]}
                                 infoLines={[
                                    `${opt.errorLabel[0]}  ·  ${opt.errorLabel[1]}`,
                                    `${opt.errorLabel[2]}  ·  ${opt.errorLabel[3]}`,
                                    `${opt.errorLabel[4]}  ·  ${opt.errorLabel[5]}`,
                                 ]}
                                 color={isActive ? "green" : "gray"}
                                 variant={isActive ? "filled" : isPending ? "default" : "light"}
                                 onClick={() => void handleSetpointClick(sp)}
                                 loading={busy && isPending}
                                 disabled={busy}
                                 resistors={displayResistors(opt.comboDisplay)}
                                 />

                                 <SimpleGrid cols={2} spacing={"5px"} verticalSpacing={"5px"}>
                                    {/* AMP Values */}
                                    <NumberInput // DuT
                                    mt={"auto"}
                                    min={0} 
                                    suffix={" A"}
                                    placeholder={`${sp.currentA} A`} 
                                    />
                                    <NumberInput // Tool
                                    mt={"auto"}
                                    min={0} 
                                    suffix={" A"}
                                    placeholder={`${sp.currentA} A`} 
                                    />

                                    {/* VOLT Values */}
                                    <NumberInput // Dut
                                    min={0} 
                                    suffix={" V"}
                                    placeholder={opt.errorLabel[6]} 
                                    />
                                    <NumberInput // Tool
                                    min={0} 
                                    suffix={" V"}
                                    placeholder={opt.errorLabel[6]} 
                                    />
                                 </SimpleGrid>

                              </SimpleGrid>
                           </Box>
                        );
                     })}
                  </SimpleGrid>

               </Flex>
            </ScrollArea>

            <DevEchoPcbTest />
         </Flex>

      </StepShell>
   );
};


export default LBCalStep;
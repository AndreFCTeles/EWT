import React, { useEffect, useState } from "react"; // useMemo,
import { Button, Group, NumberInput, Stack, Text, Badge } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {  generateSetpointsForProcess, resolveLoadBankSetpoint } from "@/services/utils/setpoints";
import { setLoadBankContactors } from "@/services/utils/hardware";
import { startLoadBankPolling } from "@/services/utils/lbProtocol";
import type { Dut, Process } from "@/types/checklistTypes";
import { LoadBankStatus, SetpointConfig } from "@/types/commTypes";

type Props = {
   dut: Dut;
   process: Process;
   port_name: string;      // from detection step
   minCurrent: number;
};

const MIN_CURRENT_FOR_SWITCH = 0.5; // A


export const LoadBankCalibrationStep: React.FC<Props> = ({ dut, process, port_name, minCurrent }) => {
   if (!dut.ratedCurrent) {
      console.log("erro - potência não introduzida");
      return;
   }
   const maxRated = dut.ratedCurrent;
   const [minSetpoint, setMinSetpoint] = useState<number>(() => {
      if (process === "MIGConv") return Math.round(maxRated * 0.25); // 25% rule as default
      return minCurrent ?? Math.round(maxRated * 0.25);
   });
   
   const [pendingSetpointId, setPendingSetpointId] = useState<number | null>(null); 
   const [bankStatus, setBankStatus] = useState<LoadBankStatus | null>(null);
   const [setpoints, setSetpoints] = useState<SetpointConfig[]>([]);
   const [activeSetpointId, setActiveSetpointId] = useState<number | null>(null);
   const [optionIndices, setOptionIndices] = useState<Record<number, number>>({});
   const [busy, { open: setBusy, close: clearBusy }] = useDisclosure(false);

   // Start polling when component mounts
   useEffect(() => {
      const controller = new AbortController();
      startLoadBankPolling(port_name, s => setBankStatus(s), controller.signal)
         .catch(console.error);
      return () => {
         controller.abort();
      };
   }, [port_name]);

   // Recompute setpoints whenever min/max changes
   useEffect(() => {
      if (!maxRated || !minSetpoint) return;
      if (maxRated <= 0 || minSetpoint < 0) return;
      const currents = generateSetpointsForProcess(process, minSetpoint, maxRated, 4);
      const configs = currents.map((currentA: number, idx: number) =>
         resolveLoadBankSetpoint(idx + 1, process, "1000A", currentA) // choose bank type
      );
      setSetpoints(configs);
      setOptionIndices({});
      setActiveSetpointId(null);
   }, [minSetpoint, maxRated, process]);

   const isOffline = !bankStatus;

   async function handleSetpointClick(sp: SetpointConfig) {
      if (!bankStatus) return;
      const currentMeas = bankStatus.contactorsMask === 0 ? 0 : undefined; 
      // ↑ your real measured current comes from meter, not from this frame.
      // Substitute with actual value from your measurement pipeline.

      if (currentMeas !== undefined && Math.abs(currentMeas) > MIN_CURRENT_FOR_SWITCH) {
         // show some notification instead of alert in your real app
         alert("Não é permitido mudar de ponto enquanto há corrente. Reduza a corrente para 0 A.");
         return;
      }

      const options = sp.options;
      if (!options.length) return;

      const currentIdx = optionIndices[sp.id] ?? -1;
      const nextIdx = (currentIdx + 1) % options.length;
      const nextOption = options[nextIdx];

      setBusy();
      try {
         // MMA: all-off first
         if (process === "MMA") {
         await setLoadBankContactors({
            port_name,
            lastStatus: bankStatus,
            contactorsMask: 0x0000,
         });
         // optional: wait for status update here
         }

         const newStatus = await setLoadBankContactors({
            port_name,
            lastStatus: bankStatus,
            contactorsMask: nextOption.mask,
         });

         setBankStatus({ ...newStatus, port_name });
         setActiveSetpointId(sp.id);
         setOptionIndices(prev => ({ ...prev, [sp.id]: nextIdx }));
      } catch (e) {
         console.error(e);
         alert("Falha ao comunicar com a banca de carga.");
      } finally {
         clearBusy();
      }
   }

   return (
      <Stack gap="md">
         <Text fw={600}>Pontos de calibração (corrente)</Text>

         <Group gap="md">
            <NumberInput
            label="Ponto mínimo (A)"
            value={minSetpoint}
            onChange={val => typeof val === "number" && setMinSetpoint(val)}
            min={0}
            max={maxRated}
            />
            <NumberInput
            label="Ponto máximo (A)"
            value={maxRated}
            disabled
            description="Corrente máxima de chapa do equipamento"
            />
            {isOffline && (
               <Badge color="red" variant="filled">
                  Banca offline
               </Badge>
            )}
            {!isOffline && (
               <Badge color="green" variant="light">
                  Banca online {bankStatus?.bankPower} A / nº {bankStatus?.bankNo}
               </Badge>
            )}
         </Group>

         <Group gap="sm">
            {setpoints.map(sp => {
               const idx = optionIndices[sp.id] ?? 0;
               const opt = sp.options[idx];
               const isActive = activeSetpointId === sp.id;

               return (
                  <Button
                  key={sp.id}
                  variant={isActive ? "filled" : "outline"}
                  onClick={() => handleSetpointClick(sp)}
                  loading={busy}
                  disabled={isOffline}
                  >
                     <Stack gap={0} align="flex-start">
                        <Text size="sm">
                           Ponto {sp.id}: {sp.currentA} A
                        </Text>
                        {opt && (
                           <Text size="xs">
                              {opt.label} ({opt.errorPercent.toFixed(1)}%)
                           </Text>
                        )}
                        {sp.options.length > 1 && (
                           <Text size="xs" c="dimmed">
                              Clique para alternar combinação ({idx + 1}/{sp.options.length})
                           </Text>
                        )}
                     </Stack>
                  </Button>
               );
            })}
         </Group>
      </Stack>
   );
};


export default LoadBankCalibrationStep;
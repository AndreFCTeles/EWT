import React, { useMemo, useState } from "react";
import {
   Button,
   Card,
   Group,
   List,
   NumberInput,
   Select,
   Stack,
   Text,
   Textarea,
   Title,
} from "@mantine/core";

import type { StepRuntimeProps } from "@checklist/pipeline";
import type { TflGroupResult, Unit } from "@/types/checklistTypes";

import {
   TFL_PROCEDURES,
   resolveTflProcedure,
   type TflProcedureDef,
   type TflGroupDef,
} from "@/components/tfl/tflProcedures";
import { nowIso } from "@/services/utils/generalUtils";


function verdictFromGroups(groups: TflGroupResult[]): "pass" | "fail" | "warn" {
   if (groups.some((g) => g.verdict === "fail")) return "fail";
   if (groups.some((g) => g.verdict === "warn")) return "warn";
   return "pass";
}

function unitToLabel(u?: Unit) {
   return u ?? "";
}

export const TflRunnerStep: React.FC<StepRuntimeProps> = ({ id, submission, complete }) => {
   // allow override of procedure id directly in this step (skeleton phase)
   const [procedureId, setProcedureId] = useState<string | null>(submission.vars?.tflProcedureId ?? null);
   
   const procedure: TflProcedureDef = useMemo(() => {
      const sub = {
         ...submission,
         vars: { ...(submission.vars ?? {}), tflProcedureId: procedureId ?? undefined },
      };
      return resolveTflProcedure(sub);
   }, [submission, procedureId]);
   
   const groups: TflGroupDef[] = useMemo(() => {
      return procedure.groups.filter((g) => (g.when ? g.when(submission) : true));
   }, [procedure, submission]);
   
   const [idx, setIdx] = useState(0);
   const [results, setResults] = useState<TflGroupResult[]>([]);
   
   const active = groups[Math.min(idx, Math.max(0, groups.length - 1))];
   
   // per-group local inputs
   const [value, setValue] = useState<number | undefined>(undefined);
   const [notes, setNotes] = useState<string>("");
   
   const procedureOptions = useMemo(
      () =>
         TFL_PROCEDURES.map((p) => ({
         value: p.procedureId,
         label: `${p.procedureId} — ${p.title}`,
      })),
      []
   );
   
   function submitGroup(verdict: "pass" | "fail") {
      const capture = active.capture;
      
      const unit = capture && capture.type === "number" ? capture.unit : undefined;
      
      const res: TflGroupResult = {
         key: active.key,
         title: active.title,
         verdict,
         value: capture && capture.type === "number" ? value : undefined,
         unit,
         notes: notes.trim() ? notes.trim() : undefined,
      };
      
      const nextResults = [...results, res];
      setResults(nextResults);
      
      // reset per-group inputs
      setValue(undefined);
      setNotes("");
      
      const nextIdx = idx + 1;
      
      if (nextIdx >= groups.length) {
         // finish the TFL runner as a single checklist step
         const overall = verdictFromGroups(nextResults);
         const now = nowIso();
         
         complete(
            {
               id,
               startedAt: now,
               endedAt: now,
               verdict: overall,
               inputs: {
                  procedureId: procedure.procedureId,
                  procedureTitle: procedure.title,
                  groups: nextResults.length,
               },
            } as any,
            {
               // keep the selection for later
               vars: {
                  tflProcedureId: procedure.procedureId,
                  tflProductFamily: submission.vars?.tflProductFamily,
               },
               tfl: {
                  procedureId: procedure.procedureId,
                  procedureTitle: procedure.title,
                  productFamily: submission.vars?.tflProductFamily,
                  groups: nextResults,
               },
            } as any
         );
         return;
      }
      setIdx(nextIdx);
   }
   
   if (!active) {
      return (
         <Card withBorder>
            <Text c="red">Nenhum grupo definido para este procedimento.</Text>
         </Card>
      );
   }
   
   const capture = active.capture;
   
   return (
      <Stack gap="sm">
         <Card withBorder>
            <Stack gap={6}>
               <Title order={4}>Procedimento TFL</Title>
               <Select
               label="Procedimento"
               data={procedureOptions}
               value={procedureId ?? procedure.procedureId}
               onChange={(v) => setProcedureId(v)}
               searchable
               clearable
               description="(Skeleton) Pode trocar o procedimento aqui. Mais tarde será inferido automaticamente pelo produto/família."
               />
               <Text size="sm" c="dimmed">
                  Grupo {idx + 1} / {groups.length}
               </Text>
            </Stack>
         </Card>

         <Card withBorder>
            <Stack gap="sm">
               <Title order={4}>{active.title}</Title>
               
               <List spacing="xs">
                  {active.ops.map((t, i) => (
                     <List.Item key={i}>{t}</List.Item>
                  ))}
               </List>

               {capture && capture.type === "number" && (
                  <NumberInput
                  label={capture.hint ? `Valor (${unitToLabel(capture.unit)}) — ${capture.hint}` : `Valor (${unitToLabel(capture.unit)})`}
                  value={value}
                  onChange={(v) => setValue(typeof v === "number" ? v : undefined)}
                  decimalScale={3}
                  hideControls
                  />
               )}
               
               <Textarea
               label="Notas (opcional)"
               value={notes}
               onChange={(e) => setNotes(e.currentTarget.value)}
               minRows={2}
               />
      
               <Group justify="space-between" mt="xs">
                  <Button color="red" onClick={() => submitGroup("fail")}>Falhou</Button>
                  <Button onClick={() => submitGroup("pass")}>Passou</Button>
               </Group>
            </Stack>
         </Card>
      </Stack>
   );
};

export default TflRunnerStep;


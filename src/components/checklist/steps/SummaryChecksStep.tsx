import React, { useMemo } from "react";
import { Button, Card, Group, List, Stack, Text, Title } from "@mantine/core";

import type { StepRuntimeProps } from "@checklist/pipeline";
import type { StepRecord, Verdict } from "@/types/checklistTypes";
import { StepShell } from "@checklist/StepShell";
import { nowIso } from "@/services/utils/generalUtils";

function pickOverallVerdict(vs: Array<Verdict | undefined>): Verdict {
// precedence: fail > warn > pass; ignore skipped/undefined
if (vs.some((v) => v === "fail" || v === "falhou")) return "fail";
if (vs.some((v) => v === "warn" || v === "aviso")) return "warn";
if (vs.some((v) => v === "pass" || v === "OK")) return "pass";
return "warn";
}

function labelVerdict(v?: Verdict) {
   if (!v) return "—";
   if (v === "pass" || v === "OK") return "Passou";
   if (v === "fail" || v === "falhou") return "Falhou";
   if (v === "warn" || v === "aviso") return "Aviso";
   if (v === "skipped" || v === "ignorado") return "Ignorado";
   return String(v);
}

function findStep(sub: any, id: string): StepRecord | undefined {
   return (sub.steps ?? []).find((s: StepRecord) => s.id === id);
}

/**
 * Summary step that displays *checks* and their results.
 * - For TFL: shows procedure group results (pass/fail + optional value)
 * - For Val/Cal: shows the relevant checklist step results (detected LB + calibration)
 */
export const SummaryChecksStep: React.FC<StepRuntimeProps> = ( {
   id,
   submission,
   canGoBack,
   goBack,
   complete,
} ) => {
   const mode = (submission.vars?.mode ?? "VALCAL") as string;

   const tflGroups = (submission as any).tfl?.groups as
      | Array<{ title: string; verdict: "pass" | "fail" | "warn" | "skipped"; value?: number; unit?: string; notes?: string }>
      | undefined;

   const valcalChecks = useMemo(() => {
      const detect = findStep(submission, "detectPowerBank");
      const cal = findStep(submission, "calibration");
      const ocv = findStep(submission, "ocvMeasure");
      return [
         { label: "Deteção banca de carga", rec: detect },
         { label: "Medição U2 (vazio)", rec: ocv },
         { label: "Teste em carga / calibração", rec: cal },
      ].filter((x) => !!x.rec);
   }, [submission]);

   const overall = useMemo(() => {
      if (mode === "TFL") {
         const vs = (tflGroups ?? []).map((g) => g.verdict as any);
         return pickOverallVerdict(vs);
      }
      const vs = valcalChecks.map((c) => c.rec?.verdict);
      return pickOverallVerdict(vs);
   }, [mode, tflGroups, valcalChecks]);

   const title = mode === "TFL" ? "Resumo TFL" : "Resumo Val/Cal";

   return (
      <StepShell title={title} canGoBack={canGoBack} onBack={goBack}>
         <Stack gap="sm">
            <Card withBorder>
               <Group justify="space-between">
                  <Title order={4}>Resultado global</Title>
                  <Text fw={700}>{labelVerdict(overall)}</Text>
               </Group>
            </Card>

            {mode === "TFL" ? (
               <Card withBorder>
                  <Title order={4} mb="xs">Verificações</Title>
                  {!tflGroups?.length ? (
                     <Text c="dimmed">Sem resultados TFL.</Text>
                  ) : (
                     <List spacing="xs">
                        {tflGroups.map((g, i) => (
                           <List.Item key={`${i}-${g.title}`}>
                              <Group justify="space-between" wrap="nowrap">
                                 <Text>{g.title}</Text>
                                 <Text fw={600} style={{ whiteSpace: "nowrap" }}>
                                    {labelVerdict(g.verdict as any)}
                                    {typeof g.value === "number" ? ` — ${g.value}${g.unit ?? ""}` : ""}
                                 </Text>
                              </Group>
                              {g.notes ? <Text size="sm" c="dimmed">{g.notes}</Text> : null}
                           </List.Item>
                        ))}
                     </List>
                  )}
               </Card>
            ) : (
               <Card withBorder>
                  <Title order={4} mb="xs">Verificações</Title>
                  {!valcalChecks.length ? (
                     <Text c="dimmed">Sem resultados Val/Cal.</Text>
                  ) : (
                     <List spacing="xs">
                        {valcalChecks.map((c) => (
                           <List.Item key={c.label}>
                              <Group justify="space-between" wrap="nowrap">
                                 <Text>{c.label}</Text>
                                 <Text fw={600} style={{ whiteSpace: "nowrap" }}>
                                    {labelVerdict(c.rec?.verdict)}
                                 </Text>
                              </Group>
                              {c.rec?.notes?.length ? (
                                 <Text size="sm" c="dimmed">{c.rec.notes.join(" ")}</Text>
                              ) : null}
                           </List.Item>
                        ))}
                     </List>
                  )}
               </Card>
            )}

            <Group justify="flex-end">
               <Button
               onClick={() => {
                  const now = nowIso();
                  complete(
                     { id, startedAt: now, endedAt: now, verdict: overall } as any,
                     {
                        root: {
                        finalVerdict: overall,
                        generatedAt: now,
                        version: (submission as any).version ?? 1,
                        },
                     } as any
                  );
               }} >
                  Continuar
               </Button>
            </Group>
         </Stack>
      </StepShell>
   );
   };

   export default SummaryChecksStep;

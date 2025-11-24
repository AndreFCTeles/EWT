import React, { useMemo, useState, useEffect } from "react";
import { Badge, Group, Loader, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";

import type { SimpleCalibration, Section, Row, MeasurementKind, Wave } from "@/types/toolCalTypes";
import { useLatestCalibration } from "@/hooks/useToolCal";
import { serialToFormatDate } from "@utils/generalUtils";



// ----- UTILS -----

// table cells
const fmt = (v: number | null | undefined, digits = 2) =>
   v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);

const take = (arr: number[], i: number) => (arr?.[i] ?? null);

function kindToTitle(kind: MeasurementKind, unit: string, wave: Wave) {
   const waveUp = (wave || "").toUpperCase(); // DC / AC
   const unitUp = (unit || "").toUpperCase(); // V / A
   if (unitUp === "V" || String(kind).startsWith("voltage")) return `Verificação da Tensão (${unitUp} ${waveUp})`;
   if (unitUp === "A" || String(kind).startsWith("current")) return `Verificação da Corrente (${unitUp} ${waveUp})`;
   return `Verificação (${[unitUp, waveUp].filter(Boolean).join(" ")})`;
}

function buildSectionsFromTests(cal: SimpleCalibration | null): Section[] {
   if (!cal || !Array.isArray(cal.tests) || cal.tests.length === 0) return [];

   // group key = kind|unit|wave
   const groups = new Map<string, {
      kind: MeasurementKind; 
      unit: string; 
      wave: Wave; 
      percent: number; 
      lsdFactor: number; 
      rows: Row[] 
   }>();

   for (const t of cal.tests) {
      const key = `${t.kind}|${t.unit}|${t.wave}`;
      const unitLabel = [t.unit, (t.wave || "").toUpperCase()].filter(Boolean).join(" ");

      const row: Row = {
         reference: Number(t.setpoint ?? 0),
         unit: unitLabel,
         stdReadings: [...t.stdReadings],
         dutReadings: [...t.dutReadings],
         stdMean: Number(t.stdMean ?? 0),
         dutMean: Number(t.dutMean ?? 0),
         lsd: Number((t.lsd ?? 0) ?? 0),
         trueValue: Number(t.trueValue ?? 0),
         dutError: Number(t.dutError ?? 0),
         emaAllowed: Number(t.emaAllowed ?? 0),
         delta: Number(t.delta ?? 0),
         pass: Boolean(typeof t.pass === "boolean" ? t.pass : t.ok),
      };

      if (!groups.has(key)) {
         groups.set(key, {
            kind: t.kind,
            unit: t.unit,
            wave: t.wave,
            percent: Number(t.rulePercent ?? 0),
            lsdFactor: Number(t.ruleLsdFactor ?? 0),
            rows: [row],
         });
      } else {
         groups.get(key)!.rows.push(row);
      }
   }

   const sections: Section[] = [];
   for (const g of groups.values()) {
      const title = kindToTitle(g.kind, g.unit, g.wave);
      sections.push({
         title,
         kind: g.kind,
         rule: { percent: g.percent, lsdFactor: g.lsdFactor },
         rows: g.rows.sort((a, b) => a.reference - b.reference),
         pass: g.rows.every((r) => r.pass),
      });
   }

   // Keep a stable order: Voltage DC, Voltage AC, Current DC, Current AC, others
   const kindOrder = new Map<MeasurementKind, number>([
      ["voltage_dc", 0],
      ["voltage_ac", 1],
      ["current_dc", 2],
      ["current_ac", 3],
      ["other", 4],
   ]);

   sections.sort((a, b) => {
      const ka = kindOrder.get(a.kind) ?? 99;
      const kb = kindOrder.get(b.kind) ?? 99;
      if (ka !== kb) return ka - kb;
      return a.title.localeCompare(b.title);
   });

   return sections;
}





type Props = { instrumentCode?: string };


// ----- COMPONENT -----

const CalibrationViewer: React.FC<Props>  = ({ instrumentCode }) => {
   const [code, setCode] = useState<string | null>(instrumentCode ?? null);
   useEffect(() => { if (instrumentCode) setCode(instrumentCode); }, [instrumentCode]);

   const { 
      data: cal, 
      loading, 
      error, 
   } = useLatestCalibration(code ?? undefined);

   const sections = useMemo(() => buildSectionsFromTests(cal), [cal]);
   const hasData = Boolean(cal && sections.length > 0);

   if (loading) return <Loader />;
   if (error) return <Text c="red">Erro: {error.message}</Text>;


   // RENDER
   return (
      <>
         <Stack gap={0} pb={'sm'} align="center" justify="center" w={"100%"}>            
            {cal ? (
               <>
                  <Text fw={600}>
                     {cal.instrument.name} ({cal.instrument.code})
                  </Text>
                  <Text size="sm" c="dimmed">
                     Verificado: {serialToFormatDate(cal.verifiedAt) || "—"} | Validado: {serialToFormatDate(cal.validatedAt) || "—"}
                  </Text>
               </>
            ) : (
               <Text c="dimmed">{code ? 
                  "Sem calibração encontrada." : 
                  "Nenhum instrumento selecionado."
               }</Text>
            )}
         </Stack>

         {hasData  && (
            <ScrollArea.Autosize mah={"80vh"}>
               <Stack gap="lg">
                  {sections.map((sec, sidx) => (
                     <div key={sidx}>
                        <Group gap="sm" mb={4}>
                           <Text fw={600}>{sec.title}</Text>
                           <Badge color={sec.pass ? "green" : "red"}>{sec.pass ? "APTO" : "NÃO APTO"}</Badge>
                        </Group>
                        <Text size="sm" c="dimmed" mb="xs">
                           |EMA| = {(sec.rule.percent * 100).toFixed(2)}% + {sec.rule.lsdFactor}×LSD
                        </Text>

                        <Table striped highlightOnHover withTableBorder withColumnBorders>
                           <Table.Thead>
                              <Table.Tr>
                                 <Table.Th rowSpan={2} style={{ verticalAlign: "bottom" }}>Referência</Table.Th>
                                 <Table.Th colSpan={4} ta="center"                        >Leitura no padrão</Table.Th>
                                 <Table.Th colSpan={4} ta="center"                        >Leitura no RMM</Table.Th>
                                 <Table.Th rowSpan={2} style={{ verticalAlign: "bottom" }}>LSD</Table.Th>
                                 <Table.Th rowSpan={2} style={{ verticalAlign: "bottom" }}>Valor real</Table.Th>
                                 <Table.Th rowSpan={2} style={{ verticalAlign: "bottom" }}>Erro RMM</Table.Th>
                                 <Table.Th rowSpan={2} style={{ verticalAlign: "bottom" }}>|EMA|</Table.Th>
                                 <Table.Th rowSpan={2} style={{ verticalAlign: "bottom" }}>Δ</Table.Th>
                                 <Table.Th rowSpan={2} style={{ verticalAlign: "bottom" }}>Apreciação</Table.Th>
                              </Table.Tr>
                              <Table.Tr>
                                 <Table.Th>1</Table.Th>
                                 <Table.Th>2</Table.Th>
                                 <Table.Th>3</Table.Th>
                                 <Table.Th>Média</Table.Th>
                                 <Table.Th>1</Table.Th>
                                 <Table.Th>2</Table.Th>
                                 <Table.Th>3</Table.Th>
                                 <Table.Th>Média</Table.Th>
                              </Table.Tr>
                           </Table.Thead>

                           <Table.Tbody>
                              {sec.rows.map((r, i) => (
                                 <Table.Tr key={i}>
                                    <Table.Td>
                                       <Tooltip label={`${r.reference} ${r.unit}`} withArrow>
                                          <span>{r.reference} <Text span c="dimmed">{r.unit}</Text></span>
                                       </Tooltip>
                                    </Table.Td>

                                    {/* Padrão (1,2,3,M) */}
                                    <Table.Td>{fmt(take(r.stdReadings, 0))}</Table.Td>
                                    <Table.Td>{fmt(take(r.stdReadings, 1))}</Table.Td>
                                    <Table.Td>{fmt(take(r.stdReadings, 2))}</Table.Td>
                                    <Table.Td fw={600}>{fmt(r.stdMean)}</Table.Td>

                                    {/* RMM (1,2,3,M) */}
                                    <Table.Td>{fmt(take(r.dutReadings, 0))}</Table.Td>
                                    <Table.Td>{fmt(take(r.dutReadings, 1))}</Table.Td>
                                    <Table.Td>{fmt(take(r.dutReadings, 2))}</Table.Td>
                                    <Table.Td fw={600}>{fmt(r.dutMean)}</Table.Td>

                                    {/* LSD / Valor real / Erro RMM / EMA / Δ / Apreciação */}
                                    <Table.Td>{fmt(r.lsd)}</Table.Td>
                                    <Table.Td fw={600}>{fmt(r.trueValue)}</Table.Td>
                                    <Table.Td>{fmt(r.dutError)}</Table.Td>
                                    <Table.Td>{fmt(r.emaAllowed)}</Table.Td>
                                    <Table.Td fw={600}>{fmt(r.delta)}</Table.Td>
                                    <Table.Td>
                                       {r.pass ? <Badge color="green">APTO</Badge> : <Badge color="red">NÃO APTO</Badge>}
                                    </Table.Td>
                                 </Table.Tr>
                              ))}
                           </Table.Tbody>
                        </Table>
                     </div>
                  ))}
               </Stack>
            </ ScrollArea.Autosize>
         )}
      </>
   );
}


export default CalibrationViewer;
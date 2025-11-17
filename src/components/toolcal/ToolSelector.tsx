import { useEffect, useState } from "react";
import { Button, Group, Loader, Radio, Stack, Text, Flex } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { listCachedInstruments, getSelectedInstrumentCode, setSelectedInstrumentCode } from "@/services/api/toolData/calCache";
import { listLatestPerInstrument } from "@/services/api/toolData/toolApi";
import { checkOnline } from "@/services/api/toolData/toolApi.offline";
import type { Instrument, InstrumentRow } from "@/types/calTypes";
import { serialToFormatDate } from "@utils/generalUtils";
import CalibrationImporter from "./CalibrationImporter";


type Props = {
   onOpenToolCalibration: (instrumentCode: string) => void;
};

const toRow = (d: InstrumentRow, source: "server" | "cache"): InstrumentRow => {
   return {
      instrument: {
         code: d.instrument.code,
         name: d.instrument.name,
      },
      validatedAt: d.validatedAt,
      verifiedAt: d.verifiedAt,
      source,
   };
};

export const ToolSelector: React.FC<Props>  = ({onOpenToolCalibration}) => {
   const [loading, setLoading] = useState(true);
   const [items, setItems] = useState<InstrumentRow[]>([]);
   const [selected, setSelected] = useState<string | null>(null);
   
   const refresh = async () => {
      setLoading(true);
      try {
         const online = await checkOnline();
         const fromCache = (await listCachedInstruments()).map((d) => ({
            instrument: { 
               code: d.code, 
               name: d.name 
            },
            validatedAt: serialToFormatDate(d.validatedAt) || undefined,
            verifiedAt: serialToFormatDate(d.verifiedAt) || undefined,
            source: "cache" as const,
         }));

         let fromServer: InstrumentRow[] = [];
         if (online) {
            const latestMap = await listLatestPerInstrument();
            fromServer = Object.values(latestMap).map((d) => toRow(d, "server"));
         }

         const byCode = new Map<string, InstrumentRow>();
         for (const it of [...fromServer, ...fromCache]) {
            const prev = byCode.get(it.instrument.code);
            const prevTs = prev?.validatedAt ?? prev?.verifiedAt;
            const nextTs = it.validatedAt ?? it.verifiedAt;
            if (!prev || (nextTs && (!prevTs || nextTs > prevTs))) byCode.set(it.instrument.code, it);
         }

         setItems(Array.from(byCode.values()).sort((a, b) =>
            (b.validatedAt ?? b.verifiedAt ?? "").localeCompare(a.validatedAt ?? a.verifiedAt ?? "")
         ));
         setSelected(await getSelectedInstrumentCode());
      } catch (e: any) {
         notifications?.show?.({ color: "red", message: String(e?.message ?? e) });
      } finally {
         setLoading(false);
      }
   };

   useEffect(() => { refresh(); }, []);

   if (loading) return <Loader />;




   // RENDER
   return (
      <Stack gap="sm">
         <Group justify="space-between">
         <Text fw={600}>Instrumentos</Text>
         <CalibrationImporter
            onImported={(codes: Instrument[]) => {
               // optional: auto-view the only imported tool
               if (codes.length === 1) {onOpenToolCalibration(codes[0].code)}
               refresh();
            }}
         />
         </Group>
         {!items.length && <Text c="dimmed">Sem instrumentos disponíveis (cache/servidor).</Text>}

         {!!items.length && (
            <Radio.Group
            value={selected ?? ""}
            onChange={async (v) => {
               const code = v || null;
               setSelected(code);
               await setSelectedInstrumentCode(code)
               if (code) notifications?.show?.({ 
                  color: "teal", 
                  message: `Ferramenta selecionada: ${code}` 
               });
            }} >
               <Stack gap="xs">
                  {items.map((it) => (
                     <Flex 
                     gap="sm" 
                     align="center"
                     justify={"space-evenly"}
                     key={it.instrument.code} 
                     >
                        <Radio
                        key={it.instrument.code+"radio"}
                        value={it.instrument.code}
                        label={`(${it.instrument.code}) ${it.instrument.name ?? "—"}`}  //·  ${it.validatedAt ?? it.verifiedAt ?? "—"}  ·  ${it.source}
                        />
                        <Button
                        key={it.instrument.code+"button"} 
                        px={2}
                        maw={80}
                        miw={80}
                        onClick={() => onOpenToolCalibration(it.instrument.code)}>Detalhes</Button>
                     </Flex>
                  ))}
               </Stack>
            </Radio.Group>
         )}
      </Stack>
   );
};

export default ToolSelector;

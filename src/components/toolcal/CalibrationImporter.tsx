import React, { useState } from "react";
import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { SimpleCalibration, Instrument } from "@/types/toolCalTypes";
import { upsertCalibration } from "@/services/api/toolData/toolApi.offline";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

type Props = {
   onImported?: (codes: Instrument[]) => void;
};

const CalibrationImporter: React.FC<Props> = ({ onImported }) => {
   const [busy, setBusy] = useState(false);

   const importXlsx = async () => {
      if (busy) return;
      setBusy(true);

      try {
         const selected = await openDialog({
            multiple: true,
            directory: false,
            filters: [{ name: "Excel", extensions: ["xlsx"] }],
         });
         const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
         if (!paths.length) return;

         let ok = 0, fail = 0;
         const seen = new Map<string, string | undefined>();

         for (const path of paths) {
            try {
               const parsed = await invoke<SimpleCalibration>("parse_tool_calibration", { path });

               if (!parsed?.tests?.length) {
                  fail++;
                  continue;
               }

               const res = await upsertCalibration(parsed);
               const finalDoc = (res.saved ?? parsed) as SimpleCalibration;
               if (finalDoc.instrument?.code) seen.set(finalDoc.instrument.code, finalDoc.instrument.name);
               ok++;
            } catch (e: any) {
               console.error("Import error:", e);
               fail++;
            }
         }

         const codes = Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
         onImported?.(codes);

         if (ok) notifications?.show?.({ 
            color: "teal", 
            message: `Importados: ${ok}` 
         });
         if (fail) notifications?.show?.({ 
            color: "red", 
            message: `Falhados: ${fail}` 
         });
      } finally {
         setBusy(false);
      }
   };

   return (
      <Button variant="default" onClick={importXlsx} loading={busy}>
         Importar
      </Button>
   );
};

export default CalibrationImporter;

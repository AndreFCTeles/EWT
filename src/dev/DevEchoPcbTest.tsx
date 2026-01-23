import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Group, NumberInput, Stack, Text, TextInput, Code, Paper } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { DEV_ECHO_PORT, DEV_ECHO_BAUD, DEV_ECHO_DELAY, DEV_ECHO_POWER, DEV_ECHO_BANK_NO } from "@/dev/devConfig";
import type { Roundtrip } from "@/types/loadBankTypes";
import { buildLoadBankFrame, findFirstLoadBankFrame } from "@/services/hw/lbProtocol";





function toHex(bytes: number[] | Uint8Array): string {
   const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
   return arr.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}


export default function DevEchoPcbTest() {
   const [portName, setPortName] = useState<string>(DEV_ECHO_PORT ?? "COM5");
   const [baud, setBaud] = useState<number>(DEV_ECHO_BAUD ?? 115200);
   const [durationMs, setDurationMs] = useState<number>(DEV_ECHO_DELAY ?? 400);
   const [busy, setBusy] = useState(false);

   const [txHex, setTxHex] = useState<string>("");
   const [rxHex, setRxHex] = useState<string>("");
   const [parsed, setParsed] = useState<any>(null);

   const runTest = async () => {
      if (!portName) {
         notifications.show({ color: "red", title: "Porta inválida", message: "Indica uma porta (ex: COM5)." });
         return;
      }

      setBusy(true);
      setParsed(null);
      setTxHex("");
      setRxHex("");

      try {
         // Avoid port fight with runtime polling (best-effort)
         await invoke("lb_stop_polling").catch(() => {});

         // Connect
         await invoke("connect", { portName, baud });

         // Build a valid LB frame (CRC-correct) so parsing is truly exercised.
         const frame = buildLoadBankFrame({
            version: 1,
            bankPower: DEV_ECHO_POWER,
            bankNo: DEV_ECHO_BANK_NO,
            contactorsMask: 0x0000, // arbitrary mask; echo PCB should mirror bytes unchanged
            errContactors: 0,
            errFans: 0,
            errThermals: 0,
            otherErrors: 0,
         });

         setTxHex(toHex(frame));

         // Send & listen for echo
         const roundtrip = await invoke<Roundtrip>("test_roundtrip_bytes", {
            data: Array.from(frame),
            durationMs,
         });

         setRxHex(roundtrip.recv_hex || toHex(roundtrip.recv_bytes));

         // Try to parse echoed frame
         const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
         if (!match) {
            setParsed({ ok: false, message: "No valid LoadBank frame found in echo.", bytes: roundtrip.recv_bytes });
         } else {
            setParsed({ ok: true, parsed: match.parsed, raw: toHex(match.raw) });
         }

         notifications.show({
            color: "green",
            title: "Dev echo OK",
            message: "Frame enviado e eco recebido (ver detalhe abaixo).",
         });
      } catch (err: any) {
         console.error("[DevEchoPcbTest] error:", err);
         notifications.show({
            color: "red",
            title: "Falha no teste",
            message: String(err?.message ?? err),
         });
      } finally {
         await invoke("close").catch(() => {});
         setBusy(false);
      }
   };

   return (
      <Paper p="md" withBorder>
         <Stack gap="sm">
            <Text fw={600}>Dev Echo PCB Test</Text>

            <Group grow>
               <TextInput
                  label="Porta"
                  value={portName}
                  onChange={(e) => setPortName(e.currentTarget.value)}
                  placeholder="COM4"
               />
               <NumberInput label="Baud" value={baud} onChange={(v) => setBaud(Number(v) || baud)} min={1200} />
               <NumberInput
                  label="Listen (ms)"
                  value={durationMs}
                  onChange={(v) => setDurationMs(Number(v) || durationMs)}
                  min={50}
               />
            </Group>

            <Button onClick={runTest} loading={busy}>
               Testar ligação (send + echo + parse frame)
            </Button>

            {txHex && (
               <Stack gap={4}>
                  <Text size="sm" fw={600}>
                     TX frame (hex)
                  </Text>
                  <Code block>{txHex}</Code>
               </Stack>
            )}

            {rxHex && (
               <Stack gap={4}>
                  <Text size="sm" fw={600}>
                     RX buffer (hex)
                  </Text>
                  <Code block>{rxHex}</Code>
               </Stack>
            )}

            {parsed && (
               <Stack gap={4}>
                  <Text size="sm" fw={600}>
                     Parsed
                  </Text>
                  <Code block>{JSON.stringify(parsed, null, 2)}</Code>
               </Stack>
            )}
         </Stack>
      </Paper>
   );
}
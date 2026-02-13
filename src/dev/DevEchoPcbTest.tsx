import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Group, NumberInput, Stack, Text, TextInput, Code, Paper } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { 
   DEV_ECHO_PORT, 
   DEV_ECHO_BAUD, 
   //DEV_ECHO_DELAY, 
   DEV_ECHO_POWER, 
   DEV_ECHO_BANK_NO 
} from "@/dev/devConfig"; 
import { Roundtrip} from "@/types/loadBankTypes";
import { buildLoadBankFrame,  findFirstLoadBankFrame } from "@/services/hw/lbProtocol"; 





function toHex(bytes: number[] | Uint8Array): string {
   const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
   return arr.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}


export default function DevEchoPcbTest() {
   const [portName, setPortName] = useState<string>(DEV_ECHO_PORT ?? "COM4");
   const [baud, setBaud] = useState<number>(DEV_ECHO_BAUD ?? 115200);
   const [durationMs, setDurationMs] = useState<number>(100);//DEV_ECHO_DELAY ?? 400);
   const [busy, setBusy] = useState(false);

   const [txHex, setTxHex] = useState<string>("");
   const [rxHex, setRxHex] = useState<string>("");
   const [debugMSG, setDebugMSG] = useState<string>("");
   const [parsed, setParsed] = useState<any>(null);

   const [frameVersion, setFrameVersion] = useState<number>(1)
   const [framePower, setFramePower] = useState<number>(DEV_ECHO_POWER)
   const [frameNo, setFrameNo] = useState<number>(DEV_ECHO_BANK_NO)
   const [frameContactors, setFrameContactors] = useState<number>(0)
   const [frameErrContactors, setFrameErrContactors] = useState<number>(0)
   const [frameErrFans, setFrameErrFans] = useState<number>(0)
   const [frameErrThermals, setFrameErrThermals] = useState<number>(0)
   const [frameErrOther, setFrameErrOther] = useState<number>(0)


   const runTest = async () => {
      if (!portName) {
         notifications.show({ 
            color: "red", 
            title: "Porta inválida", 
            message: "Indica uma porta (ex: COM5)." 
         });
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
            version: frameVersion,
            bankPower: framePower,
            bankNo: frameNo,
            contactorsMask: frameContactors,
            errContactors: frameErrContactors,
            errFans: frameErrFans,
            errThermals: frameErrThermals,
            otherErrors: frameErrOther,
         });

         setTxHex(toHex(frame));

         // Send & listen for echo
         const roundtrip = await invoke<Roundtrip>("test_roundtrip_bytes", {
            data: Array.from(frame),
            durationMs,
         });
         const res = await invoke<{
            sent_bytes: string;
            recv_bytes: string;
            sent_hex: string;
            recv_hex: string;
            //sent_ascii: string;
            //recv_ascii: string;
            sent_frame_hex: string;
            recv_frame_hex: string;
            sent_debug_utf8: string;
            recv_debug_utf8: string;
         }>("test_roundtrip_text", { 
            payload: "ABC 123\r\n", 
            text: Array.from(frame),
            durationMs: durationMs 
         });

         //console.log("Sent ASCII:", res.sent_ascii);
         console.log("Sent HEX  :", res.sent_hex);
         console.log("Recv HEX  :", res.recv_hex);
         //console.log("Recv ASCII:", res.recv_ascii);
         console.log("Recv UTF8 :", res.recv_debug_utf8);

         setDebugMSG(res.recv_debug_utf8);//res.recv_encoded_msg);

         setRxHex(roundtrip.recv_hex || toHex(roundtrip.recv_bytes));

         // Try to parse echoed frame
         const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
         if (!match) {
            setParsed({ 
               ok: false, 
               message: "No valid LoadBank frame found in echo.", 
               bytes: roundtrip.recv_bytes 
            });
         } else {
            setParsed({ 
               ok: true, 
               parsed: match.parsed, 
               raw: toHex(match.raw) 
            });
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
               <NumberInput label="Baud" value={baud} onChange={(v) => setBaud(Number(v) || baud)} min={1200} disabled />
               <NumberInput
                  label="Listen (ms)"
                  value={durationMs}
                  onChange={(v) => setDurationMs(Number(v) || durationMs)}
                  min={50}
               />
            </Group>

            <Group grow>
               <NumberInput 
               label="Versão" 
               value={frameVersion} 
               onChange={(v) => setFrameVersion(Number(v))}
               />
               <NumberInput 
               label="Potência" 
               value={framePower} 
               onChange={(v) => setFramePower(Number(v))}
               />
               <NumberInput 
               label="Bank Nº" 
               value={frameNo} 
               onChange={(v) => setFrameNo(Number(v))}
               />
               <NumberInput 
               label="Contactors" 
               value={frameContactors} 
               onChange={(v) => setFrameContactors(Number(v))}
               />
               <NumberInput 
               label="Erro Contactores" 
               value={frameErrContactors} 
               onChange={(v) => setFrameErrContactors(Number(v))}
               />
               <NumberInput 
               label="Erro Ventoinhas" 
               value={frameErrFans} 
               onChange={(v) => setFrameErrFans(Number(v))}
               />
               <NumberInput 
               label="Erro Térmicos" 
               value={frameErrThermals} 
               onChange={(v) => setFrameErrThermals(Number(v))}
               />
               <NumberInput 
               label="Outros erros" 
               value={frameErrOther} 
               onChange={(v) => setFrameErrOther(Number(v))}
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

            {debugMSG && (
               <Stack gap={4}>
                  <Text size="sm" fw={600}>
                     Debug:
                  </Text>
                  <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                     {debugMSG}
                  </pre>
                  <Code block>{JSON.stringify(debugMSG, null, 2)}</Code>
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
import { useEffect, useMemo, useState } from "react";
import { Button, Group, NumberInput, Stack, Text, TextInput, Code, Paper, Divider } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import {
   DEV_ECHO_PORT,
   DEV_ECHO_BAUD,
   DEV_ECHO_POWER,
   DEV_ECHO_BANK_NO,
} from "@/dev/devConfig";

import type { LoadBankStatus, LoadBankHealth, SerialRxChunk, SerialTxChunk } from "@/types/loadBankTypes";

import {
   buildLoadBankFrame,
   lbEnsureRuntimeAuto,
   lbEnsureRuntimeFixed,
   lbWriteBytes,
   subscribeLoadBankHealth,
   subscribeLoadBankStatus,
   subscribeRx,
   subscribeTx,
} from "@/services/hw/lbProtocol";

function toHex(bytes: number[] | Uint8Array): string {
   const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
   return arr.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

export default function DevEchoPcbTest() {
   const [portName, setPortName] = useState<string>(DEV_ECHO_PORT ?? "COM4");
   const [baud, setBaud] = useState<number>(DEV_ECHO_BAUD ?? 115200);

   const [busy, setBusy] = useState(false);

   const [health, setHealth] = useState<LoadBankHealth | null>(null);
   const [status, setStatus] = useState<LoadBankStatus | null>(null);

   const [lastRx, setLastRx] = useState<SerialRxChunk | null>(null);
   const [lastTx, setLastTx] = useState<SerialTxChunk | null>(null);

   // Manual frame fields
   const [frameVersion, setFrameVersion] = useState<number>(1);
   const [framePower, setFramePower] = useState<number>(DEV_ECHO_POWER);
   const [frameNo, setFrameNo] = useState<number>(DEV_ECHO_BANK_NO);
   const [handshake, setHandshake] = useState<number>(0);
   const [frameContactors, setFrameContactors] = useState<number>(0);
   const [frameErrContactors, setFrameErrContactors] = useState<number>(0);
   const [frameErrFans, setFrameErrFans] = useState<number>(0);
   const [frameErrThermals, setFrameErrThermals] = useState<number>(0);
   const [frameErrOther, setFrameErrOther] = useState<number>(0);

   const frameBytes = useMemo(() => {
      try {
         return buildLoadBankFrame({
         version: frameVersion,
         bankPower: framePower,
         bankNo: frameNo,
         handshake: handshake,
         contactorsMask: frameContactors,
         errContactors: frameErrContactors,
         errFans: frameErrFans,
         errThermals: frameErrThermals,
         otherErrors: frameErrOther,
         });
      } catch {
         return null;
      }
   }, [
      frameVersion,
      framePower,
      frameNo,
      handshake,
      frameContactors,
      frameErrContactors,
      frameErrFans,
      frameErrThermals,
      frameErrOther,
   ]);

   useEffect(() => {
      let offH: null | (() => void) = null;
      let offS: null | (() => void) = null;
      let offRx: null | (() => void) = null;
      let offTx: null | (() => void) = null;

      (async () => {
         offH = await subscribeLoadBankHealth((h) => setHealth(h));
         offS = await subscribeLoadBankStatus((s) => setStatus(s));
         offRx = await subscribeRx((c) => setLastRx(c));
         offTx = await subscribeTx((c) => setLastTx(c));
      })();

      return () => {
         offH?.();
         offS?.();
         offRx?.();
         offTx?.();
      };
   }, []);

   const attachFixed = async () => {
      if (!portName) {
         notifications.show({ color: "red", title: "Porta inválida", message: "Indica uma porta (ex: COM5)." });
         return;
      }
      setBusy(true);
      try {
         await lbEnsureRuntimeFixed(portName, { baud });
         notifications.show({ color: "green", title: "Runtime", message: `Modo FIXED: ${portName}` });
      } catch (e: any) {
         notifications.show({ color: "red", title: "Erro", message: String(e?.message ?? e) });
      } finally {
         setBusy(false);
      }
   };

   const attachAuto = async () => {
      setBusy(true);
      try {
         await lbEnsureRuntimeAuto({ baud });
         notifications.show({ color: "green", title: "Runtime", message: "Modo AUTO (hotplug)" });
      } catch (e: any) {
         notifications.show({ color: "red", title: "Erro", message: String(e?.message ?? e) });
      } finally {
         setBusy(false);
      }
   };

   const sendFrame = async () => {
      if (!frameBytes) {
         notifications.show({ color: "red", title: "Frame inválida", message: "Revê os valores (fora de gama?)" });
         return;
      }

      setBusy(true);
      try {
         await lbWriteBytes(frameBytes);
         notifications.show({ color: "green", title: "TX", message: "Frame enviada via runtime." });
      } catch (e: any) {
         notifications.show({ color: "red", title: "Erro TX", message: String(e?.message ?? e) });
      } finally {
         setBusy(false);
      }
   };

   return (
      <Paper p="md" withBorder>
         <Stack gap="sm">
            <Text fw={600}>Dev Echo PCB Test (runtime-only)</Text>

            <Group grow>
               <TextInput label="Porta (FIXED)" value={portName} onChange={(e) => setPortName(e.currentTarget.value)} />
               <NumberInput label="Baud" value={baud} onChange={(v) => setBaud(Number(v) || baud)} min={1200} />
            </Group>

            <Group>
               <Button onClick={attachFixed} loading={busy}>Ligar runtime (FIXED)</Button>
               <Button variant="light" onClick={attachAuto} loading={busy}>Voltar a AUTO (hotplug)</Button>
            </Group>

            <Divider my="xs" />

            <Text size="sm" fw={600}>Manual frame builder</Text>
            <Group grow>
               <NumberInput label="Versão" value={frameVersion} onChange={(v) => setFrameVersion(Number(v))} />
               <NumberInput label="Potência" value={framePower} onChange={(v) => setFramePower(Number(v))} />
               <NumberInput label="Bank Nº" value={frameNo} onChange={(v) => setFrameNo(Number(v))} />
               <NumberInput label="Handshake" value={handshake} onChange={(v) => setHandshake(Number(v))} />
               <NumberInput label="Contactors" value={frameContactors} onChange={(v) => setFrameContactors(Number(v))} />
               <NumberInput label="Erro Contactores" value={frameErrContactors} onChange={(v) => setFrameErrContactors(Number(v))} />
               <NumberInput label="Erro Ventoinhas" value={frameErrFans} onChange={(v) => setFrameErrFans(Number(v))} />
               <NumberInput label="Erro Térmicos" value={frameErrThermals} onChange={(v) => setFrameErrThermals(Number(v))} />
               <NumberInput label="Outros erros" value={frameErrOther} onChange={(v) => setFrameErrOther(Number(v))} />
            </Group>

            <Button onClick={sendFrame} loading={busy} disabled={!frameBytes}>
               Enviar frame (TX)
            </Button>

            {frameBytes && (
               <Stack gap={4}>
                  <Text size="sm" fw={600}>TX frame (hex)</Text>
                  <Code block>{toHex(frameBytes)}</Code>
               </Stack>
            )}

            <Divider my="xs" />

            <Stack gap={4}>
               <Text size="sm" fw={600}>Runtime health</Text>
               <Code block>{JSON.stringify(health, null, 2)}</Code>
            </Stack>

            <Stack gap={4}>
               <Text size="sm" fw={600}>Last status</Text>
               <Code block>{JSON.stringify(status, null, 2)}</Code>
            </Stack>

            <Group grow mih={"1300px"}align="start" justify="start">
               <Stack gap={4}>
                  <Text size="sm" fw={600}>Last TX</Text>
                  <Code block>{lastTx ? JSON.stringify(lastTx, null, 2) : "-"}</Code>
               </Stack>
               <Stack gap={4}>
                  <Text size="sm" fw={600}>Last RX</Text>
                  <Code block>{lastRx ? JSON.stringify(lastRx, null, 2) : "-"}</Code>
               </Stack>
            </Group>
         </Stack>
      </Paper>
   );
}

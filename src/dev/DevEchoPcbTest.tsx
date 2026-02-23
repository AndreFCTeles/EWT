import { Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { DEV_ECHO_BAUD } from "@/dev/devConfig";
import { lbWriteBytes, startLoadBankPolling } from "@/services/hw/lbProtocol";
import type { LoadBankHealth, LoadBankStatus } from "@/types/loadBankTypes";

function parseCsvBytes(s: string): number[] {
   const parts = s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

   const bytes: number[] = [];
   for (const p of parts) {
      const v = Number(p);
      if (!Number.isFinite(v) || v < 0 || v > 255) {
         throw new Error(`Invalid byte: '${p}'`);
      }
      bytes.push(v);
   }
   return bytes;
}

const DevEchoPcbTest: React.FC = () => {
   const [ports, setPorts] = useState<string[]>([]);
   const [portName, setPortName] = useState<string | null>(null);
   const [baud, setBaud] = useState<number>(DEV_ECHO_BAUD);
   const [connected, setConnected] = useState(false);

   const [txInput, setTxInput] = useState("1, 2, 3, 4");
   const [log, setLog] = useState<string[]>([]);
   const [lastStatus, setLastStatus] = useState<LoadBankStatus | null>(null);
   const [lastHealth, setLastHealth] = useState<LoadBankHealth | null>(null);

   const acRef = useRef<AbortController | null>(null);
   const stopRef = useRef<null | (() => Promise<void>)>(null);

   const portOptions = useMemo(
      () => ports.map((p) => ({ value: p, label: p })),
      [ports]
   );

   async function refreshPorts() {
      const res = await invoke<{ port_name: string }[]>("list_ports_detailed");
      setPorts(res.map((p) => p.port_name));
   }

   useEffect(() => {
      void refreshPorts();
   }, []);

   async function connect() {
      if (!portName) {
         setLog((l) => ["Select a port first", ...l]);
         return;
      }

      // NOTE: This uses the *same* Rust runtime (single-owner).
      // Connecting here will switch runtime to FIXED mode on this port.
      // Use only for development/testing.

      await disconnect();

      const ac = new AbortController();
      acRef.current = ac;

      stopRef.current = await startLoadBankPolling(
         portName,
         (s) => {
            setLastStatus(s);
         },
         baud,
         ac.signal,
         (h) => {
            setLastHealth(h);
            setConnected(Boolean(h.online));
         },
         (rx) => {
            setLog((l) => [`[RX ${portName}] ${rx}`, ...l].slice(0, 200));
         },
         (tx) => {
            setLog((l) => [`[TX ${portName}] ${tx}`, ...l].slice(0, 200));
         }
      );
   }

   async function disconnect() {
      acRef.current?.abort();
      acRef.current = null;

      const stop = stopRef.current;
      stopRef.current = null;

      if (stop) await stop().catch(() => {});
      setConnected(false);
   }

   async function sendOnce() {
      try {
         const bytes = parseCsvBytes(txInput);
         await lbWriteBytes(Uint8Array.from(bytes));
      } catch (err: any) {
         setLog((l) => [`[ERR] ${err?.message ?? String(err)}`, ...l]);
      }
   }

   return (
      <Stack gap="sm">
         <Group justify="space-between">
         <Text fw={700}>Dev Echo PCB Test (runtime-based)</Text>
         <Button variant="light" onClick={refreshPorts}>
            Refresh ports
         </Button>
         </Group>

         <Group>
         <Select
            label="Port"
            data={portOptions}
            value={portName}
            onChange={setPortName}
            searchable
            w={280}
         />
         <TextInput
            label="Baud"
            value={String(baud)}
            onChange={(e) => setBaud(Number(e.currentTarget.value) || DEV_ECHO_BAUD)}
            w={140}
         />
         <Button onClick={connect} disabled={connected}>
            Connect
         </Button>
         <Button onClick={disconnect} variant="light">
            Disconnect
         </Button>
         </Group>

         <Group>
         <TextInput
            label="TX bytes (comma-separated decimals)"
            value={txInput}
            onChange={(e) => setTxInput(e.currentTarget.value)}
            w={420}
         />
         <Button onClick={sendOnce} disabled={!connected}>
            Send
         </Button>
         </Group>

         <Stack gap={4}>
         <Text size="sm">
            Connected: <b>{connected ? "YES" : "NO"}</b>
            {lastHealth?.reason ? ` — ${lastHealth.reason}` : ""}
         </Text>
         {lastStatus && (
            <Text size="sm">
               Last status ({lastStatus.portName}) mask=0x{lastStatus.contactorsMask.toString(16)}
            </Text>
         )}
         </Stack>

         <Stack gap={2} style={{ maxHeight: 260, overflow: "auto" }}>
         {log.map((l, idx) => (
            <Text key={idx} size="xs" ff="monospace">
               {l}
            </Text>
         ))}
         </Stack>
      </Stack>
   );
};

export default DevEchoPcbTest;
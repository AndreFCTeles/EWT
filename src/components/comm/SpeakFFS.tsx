import React, { useEffect, useMemo, useState } from "react";
import {
   Title,
   SimpleGrid,
   Select,
   NumberInput,
   SegmentedControl,
   TextInput,
   Switch,
   Button,
   Card,
   Text,
   Table,
   Group,
   Badge,
   Stack,
   Divider,
} from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { Roundtrip } from "@/types/commTypes";

type Props = {
   defaultPort?: string;   // e.g. "COM5"
   defaultBaud?: number;   // e.g. 115200
   listenMs?: number;      // e.g. 500
};

function parseHexFlexible(input: string): number[] {
   // Accepts: "AA BB 0d", "AA,BB", "0xAA 0x0D", "aa:bb:0d"
   const tokens = input
      .replace(/,/g, " ")
      .replace(/:/g, " ")
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean);
   const out: number[] = [];
   for (const t of tokens) {
      const clean = t.startsWith("0x") || t.startsWith("0X") ? t.slice(2) : t;
      if (!/^[0-9a-fA-F]{1,2}$/.test(clean)) continue;
      out.push(parseInt(clean, 16) & 0xff);
   }
   return out;
}

function bytesPreviewTable(title: string, data: number[]) {
   if (!data.length) return null;
   return (
      <Card withBorder radius="md" mt="md" p="sm">
         <Group justify="space-between" mb="xs">
            <Text fw={600}>{title}</Text>
            <Badge variant="light">{data.length} bytes</Badge>
         </Group>
         <Table.ScrollContainer minWidth={280} type="native"> 
         <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
               <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>HEX</Table.Th>
                  <Table.Th>DEC</Table.Th>
                  <Table.Th>BIN (8)</Table.Th>
                  <Table.Th>ASCII</Table.Th>
               </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
               {data.map((b, i) => (
                  <Table.Tr key={i}>
                     <Table.Td>{i}</Table.Td>
                     <Table.Td>{b.toString(16).toUpperCase().padStart(2, "0")}</Table.Td>
                     <Table.Td>{b.toString(10)}</Table.Td>
                     <Table.Td>{b.toString(2).padStart(8, "0")}</Table.Td>
                     <Table.Td>
                        {
                           b >= 0x20 && b <= 0x7e
                           ? String.fromCharCode(b)
                           : b === 0x0d
                           ? "␍"
                           : b === 0x0a
                           ? "␊"
                           : "·"
                        }
                     </Table.Td>
                  </Table.Tr>
               ))}
            </Table.Tbody>
         </Table>
         </Table.ScrollContainer>
      </Card>
   );
}

const SerialInspectorMini: React.FC<Props> = ({
   defaultPort = "COM5",
   defaultBaud = 115200,
   listenMs = 500,
}) => {
   const [ports, setPorts] = useState<string[]>([]);
   const [port, setPort] = useState(defaultPort);
   const [baud, setBaud] = useState(defaultBaud);
   const [mode, setMode] = useState<"ASCII" | "HEX">("ASCII");
   const [appendCR, setAppendCR] = useState(false);
   const [appendLF, setAppendLF] = useState(false);
   const [input, setInput] = useState("A"); // default: single char
   const [round, setRound] = useState<Roundtrip | null>(null);
   const [status, setStatus] = useState<string>("");
   const [statusMsg, setStatusMsg] = useState<string>("");

   useEffect(() => {
      invoke<string[]>("list_ports")
         .then((list) => setPorts(list ?? []))
         .catch(() => setPorts([]));
   }, []);


   const portOptions = useMemo(() => {
      const set = new Set([port, ...ports.filter(Boolean)]);
      return Array.from(set).filter(Boolean);
   }, [ports, port]);

   const inputBytes = useMemo(() => {
      if (mode === "ASCII") {
         let s = input;
         if (appendCR) s += "\r";
         if (appendLF) s += "\n";
         return Array.from(new TextEncoder().encode(s));
      }
      return parseHexFlexible(input);
   }, [input, mode, appendCR, appendLF]);


   async function send() {
      setRound(null);
      setStatus("Connecting…");
      try {
         await invoke("connect", { port_name: port, baud });
         setStatus("Sending…");
         const res =
            mode === "ASCII"
               ? await invoke<Roundtrip>("test_roundtrip_text", { 
                  text: input + (appendCR ? "\r" : "") + (appendLF ? "\n" : ""), 
                  duration_ms: listenMs 
               })
               : await invoke<Roundtrip>("test_roundtrip_bytes", { 
                  data: inputBytes, 
                  duration_ms: listenMs 
               });
         setRound(res);
         setStatus("Done");
      } catch (e: any) {
         setStatus("ERROR");
         setStatusMsg(`${String(e)}`);
      } /*finally {
         await invoke("close").catch(() => {});
      }*/
   }

   return (
      <>
         <Stack gap={0}>
            <Title order={4} mb={0} pb={0}>Serial Inspector (mini)</Title>
            <Text mb="sm" size="xs" c="dimmed" fw={400} lh={'xs'}
            >Tip: close any other app using the same COM port before testing here.</Text>
         </Stack>

         <Card withBorder radius="md">
            <SimpleGrid cols={1} spacing="sm" verticalSpacing="sm">
               <Stack gap={4}>
                  <Text size="sm" fw={500}>Port</Text>
                  <Select
                  data={portOptions}
                  value={port}
                  onChange={(v) => v && setPort(v)}
                  searchable
                  nothingFoundMessage="No ports"
                  />
               </Stack>

               <Stack gap={4}>
                  <Text size="sm" fw={500}>Baud</Text>
                  <NumberInput
                  value={baud}
                  clampBehavior="strict"
                  min={0}
                  step={100}
                  onChange={(v) =>
                     setBaud(typeof v === "number" ? v : parseInt(v || "0", 10) || 0)
                  } />
               </Stack>

               <Stack gap={4}>
                  <Text size="sm" fw={500}>Mode</Text>
                  <SegmentedControl
                  value={mode}
                  onChange={(v) => setMode(v as "ASCII" | "HEX")}
                  data={["ASCII", "HEX"]}
                  />
               </Stack>
            </SimpleGrid>

            <Stack mt="sm" gap="xs">
               <TextInput
               label={`Input (${mode})`}
               value={input}
               onChange={(e) => setInput(e.currentTarget.value)}
               placeholder={
                  mode === "ASCII"
                     ? "Type text (e.g., A or HELLO)"
                     : "Type hex (e.g., 41 0D 0A)"
               }
               />
               {mode === "ASCII" && (
                  <Group gap="md" mt={4} justify="center">
                     <Switch
                     checked={appendCR}
                     onChange={(e) => setAppendCR(e.currentTarget.checked)}
                     label="CR"
                     />
                     <Switch
                     checked={appendLF}
                     onChange={(e) => setAppendLF(e.currentTarget.checked)}
                     label="LF"
                     />
                  </Group>
               )}
               <Group mt="xs">
                  <Button fullWidth onClick={send}>Send & Listen ({listenMs} ms)</Button>
               </Group>
               
               {status && ( <>
                  <Stack gap={4} align="center">
                     <Group>
                        <Text size="sm" fw={500}>Status:</Text>
                        <Badge variant="outline" size="lg" color={status==='ERROR' ? "red": "blue"}>{status}</Badge>
                     </Group>
                     {status==='ERROR' && (<Text ta="center" size="xs" lh={'xs'} fw={300}>{statusMsg}</Text>)}
                  </Stack>
               </> )}
            </Stack>
         </Card>

         {bytesPreviewTable("Preview (to be sent)", inputBytes)}

         {round && (
            <>
               {bytesPreviewTable("Sent (device saw)", round.sent_bytes)}
               {bytesPreviewTable("Received", round.recv_bytes)}
               <Card withBorder radius="md">
                  <Stack gap={6}>
                     <Text><Text span fw={700}>Sent HEX:</Text> <Text span ff="monospace">{round.sent_hex}</Text></Text>
                     <Text><Text span fw={700}>Recv HEX:</Text> <Text span ff="monospace">{round.recv_hex}</Text></Text>
                     <Divider my="xs" />
                     <Text><Text span fw={700}>Sent ASCII:</Text> <Text span ff="monospace">{round.sent_ascii}</Text></Text>
                     <Text><Text span fw={700}>Recv ASCII:</Text> <Text span ff="monospace">{round.recv_ascii}</Text></Text>
                  </Stack>
               </Card>
            </>
         )}
      </>
   );
};

export default SerialInspectorMini;

import { invoke } from "@tauri-apps/api/core";
import { CRC8_TABLE, LoadBankFrame, LoadBankStatus, LB_FRAME_LEN, LB_START, LB_STOP } from "@/types/commTypes";
import { DEV_ECHO_BAUD, DEV_ECHO_DELAY, DEV_ECHO_PORT } from "@/dev/devConfig";













   // mirror CRC_Calculator(message++, 13):
   // - "size" = 13  => loop i = 1..12 inclusive
   // - frame[0] is start; frame[14] is CRC; frame[15] is stop
function crc8LoadBank(frame: Uint8Array): number {
   if (frame.length < 13) throw new Error("frame too short for CRC");
   let crc = 0;
   for (let i = 1; i < 13; i++) {
      crc = CRC8_TABLE[crc ^ frame[i]];
   }
   return crc;
}

// encode/decode helpers based on "(0x0000-0xFFFF) + 0x02" rule in the sheet.
// You may tweak these once you've confirmed behaviour with the real HW.
function encodeU8(raw: number): number {
   if (raw < 0 || raw > 0xfd) throw new Error("raw U8 out of allowed range (0x00–0xFD)");
   return (raw + 0x02) & 0xff;
}
function decodeU8(encoded: number): number {
   return (encoded - 0x02) & 0xff;
}
function encodeU16(raw: number): [number, number] {
   if (raw < 0 || raw > 0xfffd) throw new Error("raw U16 out of allowed range (0x0000–0xFFFD)");
   const val = (raw + 0x0002) & 0xffff;
   return [ (val >> 8) & 0xff, val & 0xff ];
}
function decodeU16(hi: number, lo: number): number {
   const encoded = ((hi << 8) | lo) & 0xffff;
   return (encoded - 0x0002) & 0xffff;
}









export function parseLoadBankFrame(buf: Uint8Array): LoadBankFrame | null {
   if (buf.length !== LB_FRAME_LEN) return null;
   if (buf[0] !== LB_START || buf[15] !== LB_STOP) return null;

   const crc = crc8LoadBank(buf);
   if (buf[14] !== crc) return null;

   const version = decodeU8(buf[1]);
   const bankPower = decodeU16(buf[2], buf[3]);
   const bankNo = decodeU8(buf[4]);
   const contactorsMask = decodeU16(buf[5], buf[6]);
   const errContactors = decodeU16(buf[7], buf[8]);
   const errFans = decodeU16(buf[9], buf[10]);
   const errThermals = decodeU16(buf[11], buf[12]);
   const otherErrors = decodeU8(buf[13]);

   return {
      version,
      bankPower,
      bankNo,
      contactorsMask,
      errContactors,
      errFans,
      errThermals,
      otherErrors,
   };
}


export type buildLoadBankFrameProps = {
   version: number;
   bankPower: number;
   bankNo: number;
   contactorsMask: number;
   errContactors?: number;
   errFans?: number;
   errThermals?: number;
   otherErrors?: number;
}
export function buildLoadBankFrame(input: buildLoadBankFrameProps ): Uint8Array {
   const frame = new Uint8Array(LB_FRAME_LEN);

   frame[0] = LB_START;
   frame[1] = encodeU8(input.version);

   const [pHi, pLo] = encodeU16(input.bankPower);
   frame[2] = pHi; frame[3] = pLo;

   frame[4] = encodeU8(input.bankNo);

   const [cHi, cLo] = encodeU16(input.contactorsMask);
   frame[5] = cHi; frame[6] = cLo;

   const [ecHi, ecLo] = encodeU16(input.errContactors ?? 0);
   frame[7] = ecHi; frame[8] = ecLo;

   const [evHi, evLo] = encodeU16(input.errFans ?? 0);
   frame[9] = evHi; frame[10] = evLo;

   const [etHi, etLo] = encodeU16(input.errThermals ?? 0);
   frame[11] = etHi; frame[12] = etLo;

   frame[13] = encodeU8(input.otherErrors ?? 0);

   frame[14] = crc8LoadBank(frame);
   frame[15] = LB_STOP;

   return frame;
}

/**
 * Scan an arbitrary buffer (e.g. from test_roundtrip_bytes.recv_bytes)
 * and return the first valid frame & its parsed representation.
 */
export function findFirstLoadBankFrame(raw: number[] | Uint8Array): { 
   raw: Uint8Array; 
   parsed: LoadBankFrame 
} | null {
   const buf = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
   for (let i = 0; i + LB_FRAME_LEN <= buf.length; i++) {
      const slice = buf.subarray(i, i + LB_FRAME_LEN);
      const parsed = parseLoadBankFrame(slice);
      if (parsed) return { raw: slice, parsed };
   }
   return null;
}


export async function startLoadBankPolling(
   portName: string,
   onStatus: (s: LoadBankStatus) => void,
   abortSignal: AbortSignal,
   baud = DEV_ECHO_BAUD
) {
   console.log("[LB] startLoadBankPolling", { portName, baud });
   await invoke("connect", { portName, baud });

   const loop = async () => {
      while (!abortSignal.aborted) {
         try {
            const roundtrip = await invoke<{
               recv_bytes: number[];
               sent_bytes: number[];
            }>("test_roundtrip_bytes", {
               data: [],          // just listen
               durationMs: DEV_ECHO_DELAY,
            });

            if (roundtrip.recv_bytes.length) {
               console.debug( "[LB] poll recv_bytes", roundtrip.recv_bytes );
            }
            const match = findFirstLoadBankFrame(roundtrip.recv_bytes);
            if (match) {
               onStatus({
                  ...match.parsed,
                  portName,
               });
            }
         } catch (e) {
            console.error("Power bank poll error", e);
            // Optionally mark as offline here
            await invoke("close").catch(() => {});
         }
         //await new Promise(r => setTimeout(r, 300));
      }
      console.log("[LB] polling loop stopped (abortSignal)");
   };

   loop().catch((err) => { console.error("[LB] polling loop crashed", err); });
}



//debug
export async function commTest() {
   const ports = await invoke<string[]>("list_ports");
   console.log("Ports:", ports);

   await invoke("connect", { portName: DEV_ECHO_PORT, baud: DEV_ECHO_BAUD });

   const res = await invoke<{
      sent_ascii: string;
      sent_hex: string;
      recv_hex: string;
      recv_ascii: string;
   }>("test_roundtrip_text", { payload: "ABC 123\r\n", durationMs: DEV_ECHO_DELAY });

   console.log("Sent ASCII:", res.sent_ascii);
   console.log("Sent HEX  :", res.sent_hex);
   console.log("Recv HEX  :", res.recv_hex);
   console.log("Recv ASCII:", res.recv_ascii);

   await invoke("close");
}
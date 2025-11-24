import { invoke } from "@tauri-apps/api/core";




// ------ CRC ------
export const PB_FRAME_LEN = 16;
export const PB_START = 0x01;
export const PB_STOP = 0x00;

const CRC8_TABLE: number[] = [
   0, 94, 188, 226, 97, 63, 221, 131, 194, 156, 126, 32, 163, 253, 31, 65,
   157, 195, 33, 127, 252, 162, 64, 30, 95, 1, 227, 189, 62, 96, 130, 220,
   35, 125, 159, 193, 66, 28, 254, 160, 225, 191, 93, 3, 128, 222, 60, 98,
   190, 224, 2, 92, 223, 129, 99, 61, 124, 34, 192, 158, 29, 67, 161, 255,
   70, 24, 250, 164, 39, 121, 155, 197, 132, 218, 56, 102, 229, 187, 89, 7,
   219, 133, 103, 57, 186, 228, 6, 88, 25, 71, 165, 251, 120, 38, 196, 154,
   101, 59, 217, 135, 4, 90, 184, 230, 167, 249, 27, 69, 198, 152, 122, 36,
   248, 166, 68, 26, 153, 199, 37, 123, 58, 100, 134, 216, 91, 5, 231, 185,
   140, 210, 48, 110, 237, 179, 81, 15, 78, 16, 242, 172, 47, 113, 147, 205,
   17, 79, 173, 243, 112, 46, 204, 146, 211, 141, 111, 49, 178, 236, 14, 80,
   175, 241, 19, 77, 206, 144, 114, 44, 109, 51, 209, 143, 12, 82, 176, 238,
   50, 108, 142, 208, 83, 13, 239, 177, 240, 174, 76, 18, 145, 207, 45, 115,
   202, 148, 118, 40, 171, 245, 23, 73, 8, 86, 180, 234, 105, 55, 213, 139,
   87, 9, 235, 181, 54, 104, 138, 212, 149, 203, 41, 119, 244, 170, 72, 22,
   233, 183, 85, 11, 136, 214, 52, 106, 43, 117, 151, 201, 74, 20, 246, 168,
   116, 42, 200, 150, 21, 75, 169, 247, 182, 232, 10, 84, 215, 137, 107, 53,
];










function crc8LoadBank(frame: Uint8Array): number {
   // mirror CRC_Calculator(message++, 13):
   // - "size" = 13  => loop i = 1..12 inclusive
   // - frame[0] is start; frame[14] is CRC; frame[15] is stop
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











export type LoadBankFrame = {
   version: number;        // decoded
   bankPower: number;      // decoded
   bankNo: number;         // decoded
   contactorsMask: number; // 16 bits C1..C16
   errContactors: number;
   errFans: number;
   errThermals: number;
   otherErrors: number;    // EV/EI/etc as bitfield
};
export function parseLoadBankFrame(buf: Uint8Array): LoadBankFrame | null {
   if (buf.length !== PB_FRAME_LEN) return null;
   if (buf[0] !== PB_START || buf[15] !== PB_STOP) return null;

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
   const frame = new Uint8Array(PB_FRAME_LEN);

   frame[0] = PB_START;
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
   frame[15] = PB_STOP;

   return frame;
}

/**
 * Scan an arbitrary buffer (e.g. from test_roundtrip_bytes.recv_bytes)
 * and return the first valid frame & its parsed representation.
 */
export function findFirstLoadBankFrame(raw: number[] | Uint8Array): { raw: Uint8Array; parsed: LoadBankFrame } | null {
   const buf = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
   for (let i = 0; i + PB_FRAME_LEN <= buf.length; i++) {
      const slice = buf.subarray(i, i + PB_FRAME_LEN);
      const parsed = parseLoadBankFrame(slice);
      if (parsed) return { raw: slice, parsed };
   }
   return null;
}


export type LoadBankStatus = LoadBankFrame & {
   portName: string;
   rawFrameHex?: string;
};

export async function startLoadBankPolling(
   portName: string,
   onStatus: (s: LoadBankStatus) => void,
   abortSignal: AbortSignal,
   baud = 115200
) {
   await invoke("connect", { portName, baud });

   const loop = async () => {
      while (!abortSignal.aborted) {
         try {
         const roundtrip = await invoke<{
            recv_bytes: number[];
            sent_bytes: number[];
         }>("test_roundtrip_bytes", {
            data: [],          // just listen
            durationMs: 200,
         });

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
         }
         await new Promise(r => setTimeout(r, 300));
      }
   };

   loop().catch(console.error);
}



//debug
export async function commTest() {
   const ports = await invoke<string[]>("list_ports");
   console.log("Ports:", ports);

   await invoke("connect", { portName: "COM5", baud: 115200 });

   const res = await invoke<{
      sent_ascii: string;
      sent_hex: string;
      recv_hex: string;
      recv_ascii: string;
   }>("test_roundtrip", { payload: "ABC 123\r\n", durationMs: 500 });

   console.log("Sent ASCII:", res.sent_ascii);
   console.log("Sent HEX  :", res.sent_hex);
   console.log("Recv HEX  :", res.recv_hex);
   console.log("Recv ASCII:", res.recv_ascii);

   await invoke("close");
}
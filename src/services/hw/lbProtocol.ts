import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { CRC8_TABLE, LB_FRAME_LEN, LB_START, LB_STOP } from "@/types/loadBankTypes";
import type { LoadBankFrame, LoadBankStatus, LoadBankHealth } from "@/types/loadBankTypes"; //, LoadBankFrameDev 
import { 
   DEV_ECHO_BAUD, 
   DEV_ECHO_DELAY, 
   DEV_ECHO_PORT
} from "@/dev/devConfig";






// mirror CRC_Calculator(message++, 13):
// - "size" = 13  => loop i = 1  -> 12 inclusive
// - frame[0] = start; frame[14] = CRC; frame[15] = stop
function crc8LoadBank(frame: Uint8Array): number {
   if (frame.length < 14) throw new Error("frame too short for CRC");
   let crc = 0;
   for (let i = 1; i < 14; i++) { 
      crc = CRC8_TABLE[crc ^ frame[i]]; 
   }
   return crc; // provavelmente temos de dar encode ao crc também
}


/**
 * Firmware-style CRC: CRC bytes 1 -> 13 of DECODED (pre +0x02) payload.
 * (excludes START (0), excludes CRC (14), excludes STOP (15))
 */
export function crc8LoadBank_fw(frame: Uint8Array): number {
   let crc = 0;
   for (let i = 1; i < 14; i++) { crc = CRC8_TABLE[(crc ^ (frame[i] & 0xff)) & 0xff]; }
   return crc & 0xff;
}




// --------------------------------------------
// - ENCODE FF - Per-Byte Mask - 8-bit/16-bit -
// --------------------------------------------

// Uint8
export function encodeU8_ff(raw: number): number {
   return (raw + 0x02) & 0xff;
}

export function decodeU8_ff(encoded: number): number {
   if (!Number.isInteger(encoded)) throw new Error("encoded U8 must be an integer");
   if (encoded < 0 || encoded > 0xff) throw new Error("encoded U8 out of range (0x00–0xFF)");
   return (encoded - 0x02) & 0xff;
}

// Uint16 (per-byte)
export function encodeU16_ff(raw: number): [number, number] {
   if (!Number.isInteger(raw)) throw new Error("raw U16 must be an integer");
   if (raw < 0 || raw > 0xffff) throw new Error("raw U16 out of range (0x0000–0xFFFF)");
   
   const hi = (raw >> 8) & 0xff;
   const lo = raw & 0xff;
   return [encodeU8_ff(hi), encodeU8_ff(lo)];
}

export function decodeU16_ff(hiEnc: number, loEnc: number): number {
   const hi = decodeU8_ff(hiEnc);
   const lo = decodeU8_ff(loEnc);
   return ((hi << 8) | lo) & 0xffff;
}






export function parseLoadBankFrame_ff(buf: Uint8Array): LoadBankFrame | null {
   if (buf.length !== LB_FRAME_LEN) return null;
   if (buf[0] !== LB_START || buf[15] !== LB_STOP) return null;

   // CRC covers bytes 1 -> 13
   const expectedCrc = crc8LoadBank(buf); // buf.subarray(1, 14)
   if ((buf[14] & 0xff) !== (expectedCrc & 0xff)) return null;

   const version = decodeU8_ff(buf[1]);
   const bankPower = decodeU16_ff(buf[2], buf[3]);
   const bankNo = decodeU8_ff(buf[4]);
   const contactorsMask = decodeU16_ff(buf[5], buf[6]);
   const errContactors = decodeU16_ff(buf[7], buf[8]);
   const errFans = decodeU16_ff(buf[9], buf[10]);
   const errThermals = decodeU16_ff(buf[11], buf[12]);
   const otherErrors = decodeU8_ff(buf[13]);

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

export function buildLoadBankFrame_ff(input: LoadBankFrame): Uint8Array {
   const frame = new Uint8Array(LB_FRAME_LEN);
   frame[0] = LB_START;

   frame[1] = encodeU8_ff(input.version);

   const [pHi, pLo] = encodeU16_ff(input.bankPower);
   frame[2] = pHi; frame[3] = pLo;

   frame[4] = encodeU8_ff(input.bankNo);

   const [cHi, cLo] = encodeU16_ff(input.contactorsMask);
   frame[5] = cHi; frame[6] = cLo;

   const [ecHi, ecLo] = encodeU16_ff(input.errContactors ?? 0);
   frame[7] = ecHi; frame[8] = ecLo;

   const [efHi, efLo] = encodeU16_ff(input.errFans ?? 0);
   frame[9] = efHi; frame[10] = efLo;

   const [etHi, etLo] = encodeU16_ff(input.errThermals ?? 0);
   frame[11] = etHi; frame[12] = etLo;

   frame[13] = encodeU8_ff(input.otherErrors ?? 0);

   // CRC bytes 1 -> 13 (already encoded)
   frame[15] = LB_STOP;
   return frame;
}











// -------------------------------------------
// - ENCODE 7F - Per-Byte Mask - 7-bit/7-bit -
// -------------------------------------------

// Uint8 (7-bit)
export function encodeU8_7f(raw: number): number {
   return (raw + 0x02) & 0x7f;
}

export function decodeU8_7f(encoded: number): number {
   return (encoded - 0x02) & 0x7f;
}

// Uint16 (per-byte - limited to 0x7F7F)
export function encodeU16_7f(raw: number): [number, number] {
   const hi = (raw >> 8) & 0xff;
   const lo = raw & 0xff;
   return [encodeU8_7f(hi), encodeU8_7f(lo)];
}

export function decodeU16_7f(hiEnc: number, loEnc: number): number {
   const hi = decodeU8_7f(hiEnc);
   const lo = decodeU8_7f(loEnc);
   return ((hi << 8) | lo) & 0xffff;
}




export function parseLoadBankFrame_7f(buf: Uint8Array): LoadBankFrame | null {
   if (buf.length !== LB_FRAME_LEN) return null;
   if (buf[0] !== LB_START || buf[15] !== LB_STOP) return null;

   // CRC bytes 1 -> 13 (bytes are 7F-encoded)
   const expectedCrc = crc8LoadBank(buf); // buf.subarray(1, 14)
   if ((buf[14] & 0xff) !== (expectedCrc & 0xff)) return null;

   const version = decodeU8_7f(buf[1]);
   const bankPower = decodeU16_7f(buf[2], buf[3]);
   const bankNo = decodeU8_7f(buf[4]);
   const contactorsMask = decodeU16_7f(buf[5], buf[6]);
   const errContactors = decodeU16_7f(buf[7], buf[8]);
   const errFans = decodeU16_7f(buf[9], buf[10]);
   const errThermals = decodeU16_7f(buf[11], buf[12]);
   const otherErrors = decodeU8_7f(buf[13]);

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


export function buildLoadBankFrame_7f(input: LoadBankFrame): Uint8Array {
   const frame = new Uint8Array(LB_FRAME_LEN);
   frame[0] = LB_START;

   frame[1] = encodeU8_7f(input.version);

   const [pHi, pLo] = encodeU16_7f(input.bankPower);
   frame[2] = pHi; frame[3] = pLo;

   frame[4] = encodeU8_7f(input.bankNo);

   const [cHi, cLo] = encodeU16_7f(input.contactorsMask);
   frame[5] = cHi; frame[6] = cLo;

   const [ecHi, ecLo] = encodeU16_7f(input.errContactors ?? 0);
   frame[7] = ecHi; frame[8] = ecLo;

   const [efHi, efLo] = encodeU16_7f(input.errFans ?? 0);
   frame[9] = efHi;
   frame[10] = efLo;

   const [etHi, etLo] = encodeU16_7f(input.errThermals ?? 0);
   frame[11] = etHi;
   frame[12] = etLo;

   frame[13] = encodeU8_7f(input.otherErrors ?? 0);

   // CRC over bytes 1 -> 13 (already 7F-encoded)
   frame[14] = crc8LoadBank(frame) & 0xff; // frame.subarray(1, 14)

   frame[15] = LB_STOP;
   return frame;
}









// -------------------------------------------
// - ENCODE 7F - Byte-level "wire" transform -
// -------------------------------------------

// Firmware TX: packing, +0x02 bytes 1 -> 13
function wireEncodePayloadByte(packed: number): number {
   return ((packed & 0xff) + 0x02) & 0xff;
}

// Firmware RX: +0x02 bytes 1 -> 13 (no mask in firmware)
function wireDecodePayloadByte(wireByte: number): number {
   return ((wireByte & 0xff) - 0x02) & 0xff;
}

// --------------------------
// Packing (firmware)
// --------------------------
function unpackU8(packed: number): number {
   return packed & 0x7f;
}
// (lo & 0x7F) + ((hi & 0x7F) << 8)
function unpackU16(pHi: number, pLo: number): number {
   return ( ((pHi & 0x7f) << 8) | (pLo & 0x7f)) & 0xffff;
}

// U16 packing in firmware (most fields): 1 byte = 7-bit
// Some fields: if(raw > 0x7F) hi |= 0x01
function packU16_noFlag(raw: number): [number, number] {
   const hi = (raw >> 8) & 0x7f;
   const lo = raw & 0x7f;
   return [hi, lo];
}

function packU16_withHiBit0Flag(raw: number): [number, number] {
   let hi = (raw >> 8) & 0x7f;
   const lo = raw & 0x7f;

   // Mirror firmware condition 
   if (raw > 0x7f) {
      hi = (hi | 0x01) & 0x7f;
   }
   return [hi, lo];
}

// U8 firmware packing: constrain value to 7-bit with &0x7F (then +0x02 on wire)
function packU8(raw: number): number {
   return raw & 0x7f;
}


// --------------------------
// Parse / Build (firmware ver)
// --------------------------
export function parseLoadBankFrame_fw(buf: Uint8Array): LoadBankFrame | null {
   if (buf.length !== LB_FRAME_LEN) return null;
   if (buf[0] !== LB_START || buf[15] !== LB_STOP) return null;

   console.log("encoded crc on parse", buf[14]);
   const decoded = new Uint8Array(buf);
   for (let i = 1; i < 14; i++) {
      decoded[i] = wireDecodePayloadByte(decoded[i]);
   }

   console.log("decoded crc on parse", decoded[14]);
   const expectedCrc = crc8LoadBank_fw(decoded);
   if ((buf[14] & 0xff) !== (expectedCrc & 0xff)) return null;
   
   console.log("expected encoded crc on build for comparison:", buf[14]);
   console.log("expected decodec crc on build for comparison:", decoded[14]);


   // interpret fields from decoded bytes using firmware-style unpacking
   const version = unpackU8(decoded[1]);

   // Firmware TX packed bank power as 7-bit hi/lo (no special flag)
   const bankPower = unpackU16(decoded[2], decoded[3]);

   const bankNo = unpackU8(decoded[4]);

   // Firmware RX based masks and shifts -> same unpack
   const contactorsMask = unpackU16(decoded[5], decoded[6]);
   const errContactors = unpackU16(decoded[7], decoded[8]);
   const errFans = unpackU16(decoded[9], decoded[10]);
   const errThermals = unpackU16(decoded[11], decoded[12]);

   const otherErrors = unpackU8(decoded[13]);

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





export function buildLoadBankFrame_fw(input: LoadBankFrame): Uint8Array {
   // decoded/pre-wire frame (packed payload , not +0x02)
   const decoded = new Uint8Array(LB_FRAME_LEN);
   decoded[0] = LB_START;

   decoded[1] = packU8(input.version);

   // firmware packs both power bytes as 7-bit (no special hi|=1 for power)
   const [pHi, pLo] = packU16_noFlag(input.bankPower);
   decoded[2] = pHi;
   decoded[3] = pLo;

   decoded[4] = packU8(input.bankNo);

   // firmware "if >0x7F then hi |= 0x01" behavior
   const [cHi, cLo] = packU16_withHiBit0Flag(input.contactorsMask);
   decoded[5] = cHi;
   decoded[6] = cLo;

   const [ecHi, ecLo] = packU16_withHiBit0Flag(input.errContactors ?? 0);
   decoded[7] = ecHi;
   decoded[8] = ecLo;

   const [efHi, efLo] = packU16_withHiBit0Flag(input.errFans ?? 0);
   decoded[9] = efHi;
   decoded[10] = efLo;

   const [etHi, etLo] = packU16_withHiBit0Flag(input.errThermals ?? 0);
   decoded[11] = etHi;
   decoded[12] = etLo;

   decoded[13] = packU8(input.otherErrors ?? 0);

   // CRC over decoded bytes 1 -> 13 (pre +0x02), store unshifted
   decoded[14] = crc8LoadBank_fw(decoded) & 0xff;
   console.log("decoded crc on build", decoded[14]);

   decoded[15] = LB_STOP;

   // create the wire frame / add +0x02 to bytes 1 -> 13
   const wire = new Uint8Array(decoded);
   for (let i = 1; i < 14; i++) {
      wire[i] = wireEncodePayloadByte(decoded[i]);
   }
   console.log("unencoded crc on build", wire[14]);
   // wire[14] stays as CRC (unencoded), wire[0]/wire[15] = START/STOP

   return wire;
}









/**
 * Scan (test_roundtrip_bytes.recv_bytes)
 * return the first valid frame & parsed
 */

export function findFirstLoadBankFrame(raw: number[] | Uint8Array): { 
   raw: Uint8Array; 
   parsed: LoadBankFrame 
} | null {
   const buf = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
   for (let i = 0; i + LB_FRAME_LEN <= buf.length; i++) {
      const slice = buf.subarray(i, i + LB_FRAME_LEN);
      const parsed = parseLoadBankFrame_fw(slice);
      if (parsed) return { raw: slice, parsed };
   }
   return null;
}











/* ---------- runtime polling manager (optimized) ---------- */
type StatusCb = (s: LoadBankStatus) => void;
type HealthCb = (h: LoadBankHealth) => void;

type SessionKey = string; // `${portName}:${baud}`

type Session = {
   portName: string;
   baud: number;
   statusCbs: Set<StatusCb>;
   healthCbs: Set<HealthCb>;
   unlistenStatus?: UnlistenFn;
   unlistenHealth?: UnlistenFn;
   stopping?: Promise<void>;
};

// cache
const sessions = new Map<SessionKey, Session>();
const lastStatusByPort = new Map<string, LoadBankStatus>();
const lastHealthByPort = new Map<string, LoadBankHealth>();

function keyOf(portName: string, baud: number): SessionKey {
   return `${portName}:${baud}`;
}






export function getLastLoadBankStatus(portName: string): LoadBankStatus | undefined {
   return lastStatusByPort.get(portName);
}
export function getLastLoadBankHealth(portName: string): LoadBankHealth | undefined {
   return lastHealthByPort.get(portName);
}






export async function startLoadBankPolling(
   portName: string,
   onStatus: (s: LoadBankStatus) => void,
   abortSignal: AbortSignal,
   baud: number = DEV_ECHO_BAUD,
   onHealth?: (h: LoadBankHealth) => void
): Promise<() => Promise<void>> {
   const key = keyOf(portName, baud);
   let session = sessions.get(key);

   if (!session) {
      session = {
         portName,
         baud,
         statusCbs: new Set(),
         healthCbs: new Set(),
      };
      sessions.set(key, session);

      // start runtime once
      await invoke("lb_start_polling", { portName, baud });

      // single event listeners per session
      session.unlistenStatus = await listen<LoadBankStatus>("lb/status", (e) => {
         const s = e.payload;
         if (s.portName !== portName) return;
         lastStatusByPort.set(portName, s);
         for (const cb of session!.statusCbs) cb(s);
      });

      session.unlistenHealth = await listen<LoadBankHealth>("lb/health", (e) => {
         const h = e.payload;
         if (h.portName !== portName) return;
         for (const cb of session!.healthCbs) cb(h);
      });
   }
   // register subscriber - TODO: wtf is dis lmao
   session.statusCbs.add(onStatus);
   if (onHealth) session.healthCbs.add(onHealth);

   // stop function only removes THIS subscriber; runtime stops when nobody is listening
   const stop = async () => {
      const s = sessions.get(key);
      if (!s) return;

      s.statusCbs.delete(onStatus);
      if (onHealth) s.healthCbs.delete(onHealth);

      // if still has listeners, keep runtime alive
      if (s.statusCbs.size > 0 || s.healthCbs.size > 0) return;

      // stop once
      if (!s.stopping) {
         s.stopping = (async () => {
            s.unlistenStatus?.();
            s.unlistenHealth?.();
            await invoke("lb_stop_polling").catch(() => {});
            sessions.delete(key);
         })();
      }
      await s.stopping;
   };

   if (abortSignal.aborted) {
      await stop();
      return stop;
   }
   abortSignal.addEventListener("abort", () => { void stop(); }, { once: true });

   return stop;
}

export async function lbWriteBytes(frame: Uint8Array) {
   await invoke("lb_write_bytes", { data: Array.from(frame) });
}




export async function waitForLoadBankMask(
   portName: string,
   expectedMask: number,
   cfg: { timeoutMs?: number } = {}
): Promise<LoadBankStatus> {
   const timeoutMs = cfg.timeoutMs ?? 2000;

   return new Promise((resolve, reject) => {
      const start = Date.now();
      const keyCandidates = [...sessions.values()].filter(s => s.portName === portName);
      if (keyCandidates.length === 0) {
         reject(new Error(`[LB] waitForLoadBankMask called but no active polling session for ${portName}`));
         return;
      }

      let done = false;
      const tick = (s: LoadBankStatus) => {
         if (done) return;
         if (s.portName !== portName) return;
         if ((s.contactorsMask ?? 0) === expectedMask) {
            done = true;
            cleanup();
            resolve(s);
         } else if (Date.now() - start > timeoutMs) {
            done = true;
            cleanup();
            reject(new Error(`[LB] timeout waiting for mask 0x${expectedMask.toString(16)} (last=0x${(s.contactorsMask ?? 0).toString(16)})`));
         }
      };

      // attach temporary subscriber to ALL sessions for this port
      const unsubscribers: Array<() => void> = [];
      for (const sess of sessions.values()) {
         if (sess.portName !== portName) continue;
         sess.statusCbs.add(tick);
         unsubscribers.push(() => sess.statusCbs.delete(tick));
      }

      const timer = window.setTimeout(() => {
         if (done) return;
         done = true;
         cleanup();
         reject(new Error(`[LB] timeout waiting for mask 0x${expectedMask.toString(16)}`));
      }, timeoutMs);

      const cleanup = () => {
         clearTimeout(timer);
         for (const u of unsubscribers) u();
      };

      // check last known state
      const last = getLastLoadBankStatus(portName);
      if (last) tick(last);
   });
}




//debug
export async function commTest() {
   const ports = await invoke<string[]>("list_ports");
   console.log("Ports:", ports);

   await invoke("connect", { 
      portName: DEV_ECHO_PORT, 
      baud: DEV_ECHO_BAUD 
   });

   const res = await invoke<{
      sent_ascii: string;
      sent_hex: string;
      recv_hex: string;
      recv_ascii: string;
   }>("test_roundtrip_text", { 
      payload: "ABC 123\r\n", 
      durationMs: DEV_ECHO_DELAY 
   });

   console.log("Sent ASCII:", res.sent_ascii);
   console.log("Sent HEX  :", res.sent_hex);
   console.log("Recv HEX  :", res.recv_hex);
   console.log("Recv ASCII:", res.recv_ascii);

   await invoke("close");
}











/*
// encode/decode helpers based on "(0x0000-0xFFFF) + 0x02" rule
// Uint8
function encodeU8(raw: number): number {
   if (raw < 0 || raw > 0x7f) throw new Error("raw U8 out of allowed range (0x00–0x7F)");
   return (raw + 0x02) & 0x7f;
}
function decodeU8(encoded: number): number {
   return (encoded - 0x02) & 0x7f;
}

// Uint16
function encodeU16(raw: number): [number, number] {
   if (raw < 0 || raw > 0x7f7f) throw new Error("raw U16 out of allowed range (0x0000–0x7F7F)");
   const val = (raw + 0x0002); 
   return [ (val >> 8) & 0x7f, val & 0x7f ];
}
function decodeU16(hi: number, lo: number): number {
   const encoded = ((hi << 8) | lo) & 0x7f7f; 
   return (encoded - 0x0002) & 0x7f7f;
}
*/

/*
// encode/decode helpers based on "(0x0000-0xFFFF) + 0x02" rule
// Uint8
function encodeU8FF(raw: number): number {
   if (raw < 0 || raw > 0xff) throw new Error("raw U8 out of range (0x00–0xFF)");
   return (raw + 0x02) & 0xFD;
}
function decodeU8(enc: number): number {
   if (enc < 0x02 || enc > 0xFD) throw new Error("encoded U8 out of allowed range (0x02–0xFF)");
   return (enc - 0x02) & 0xFD;
}

// Uint16
function encodeU16(raw: number): [number, number] {
   if (raw < 0 || raw > 0xFFFD) throw new Error("raw U16 out of allowed range (0x0000–0xFFFC)");
   const hi = (raw >> 8) & 0xFD;
   const lo = raw & 0xFF;
   /* // 16bit encoding
      const val = (raw + 0x0000); 
      return [ (val >> 8) & 0xff, val & 0xff ];
   */
/*

   // Per-byte encoding
   return [encodeU8(hi), encodeU8(lo)];
}
function decodeU16(hiEnc: number, loEnc: number): number { 
   */
   /*
   const encoded = ((hi << 8) | lo) & 0xffff; 
   return (encoded - 0x0000) & 0xffff;
   */
/*
   const hi = decodeU8(hiEnc);
   const lo = decodeU8(loEnc);
   return ((hi << 8) | lo) & 0xFFFF;
}
*/

/*
export function parseLoadBankFrame(buf: Uint8Array): LoadBankFrame | null {
   console.log('parsing... ');
   console.log(buf);
   if (buf.length !== LB_FRAME_LEN) return null;
   if (buf[0] !== LB_START || buf[15] !== LB_STOP) return null;

   // specific crc frame range:
   //const crc = crc8LoadBank(buf.subarray(1, 14));
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
   */

/*
export function buildLoadBankFrame(input: LoadBankFrame ): Uint8Array {
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

   // specific crc frame range
   //frame[14] = crc8LoadBank(frame.subarray(1, 14));
   frame[14] = crc8LoadBank(frame);

   frame[15] = LB_STOP;

   return frame;
}
   */

/*
export function buildLoadBankFrameDev(input: LoadBankFrameDev ): Uint8Array {
   const frame = new Uint8Array(LB_FRAME_LEN);

   frame[0] = LB_START;
   frame[1] = encodeU8(input.version);

   const [pHi, pLo] = encodeU16(input.bankPower);
   frame[2] = pHi; frame[3] = pLo;

   frame[4] = encodeU8(input.bankNo);

   frame[5] = encodeU8(input.contactorsMaskA ?? 0); 
   frame[6] = encodeU8(input.contactorsMaskB ?? 0);

   frame[7] = encodeU8(input.errContactorsA ?? 0); 
   frame[8] = encodeU8(input.errContactorsB ?? 0);

   frame[9] = encodeU8(input.errFansA ?? 0); 
   frame[10] = encodeU8(input.errFansB ?? 0);

   frame[11] = encodeU8(input.errThermalsA ?? 0);; 
   frame[12] = encodeU8(input.errThermalsB ?? 0);;

   frame[13] = encodeU8(input.otherErrors ?? 0);

   frame[14] = crc8LoadBank(frame);
   frame[15] = LB_STOP;

   return frame;
}
   */
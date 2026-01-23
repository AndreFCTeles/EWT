import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { CRC8_TABLE, LB_FRAME_LEN, LB_START, LB_STOP } from "@/types/loadBankTypes";
import type { LoadBankFrame, LoadBankStatus, LoadBankHealth } from "@/types/loadBankTypes";//, LoadBankFrameDev
import { 
   DEV_ECHO_BAUD, 
   DEV_ECHO_DELAY, 
   DEV_ECHO_PORT
} from "@/dev/devConfig";






// mirror CRC_Calculator(message++, 13):
// - "size" = 13  => loop i = 1..12 inclusive
// - frame[0] is start; frame[14] is CRC; frame[15] is stop
function crc8LoadBank(frame: Uint8Array): number {
   if (frame.length < 13) throw new Error("frame too short for CRC");
   let crc = 0;
   for (let i = 1; i < 13; i++) { crc = CRC8_TABLE[crc ^ frame[i]]; }
   return crc;
}

// encode/decode helpers based on "(0x0000-0xFFFF) + 0x02" rule
function encodeU8(raw: number): number {
   if (raw < 0 || raw > 0x7f) throw new Error("raw U8 out of allowed range (0x00–0xFD)");
   return (raw + 0x02) & 0x7f;
}
function decodeU8(encoded: number): number {
   return (encoded - 0x02) & 0x7f;
}
function encodeU16(raw: number): [number, number] {
   if (raw < 0 || raw > 0x7f7f) throw new Error("raw U16 out of allowed range (0x0000–0xFFFD)");
   const val = (raw + 0x0202) & 0x7f7f; //const val = (raw + 0x0002) & 0xffff;
   return [ (val >> 8) & 0x7f, val & 0x7f ];
}
function decodeU16(hi: number, lo: number): number {
   const encoded = ((hi << 8) | lo) & 0x7f7f;
   return (encoded - 0x0202) & 0x7f7f; //return (encoded - 0x0002) & 0xffff;
}
//const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));





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
/*
export function parseLoadBankFrameDev(buf: Uint8Array): LoadBankFrameDev | null {
   if (buf.length !== LB_FRAME_LEN) return null;
   if (buf[0] !== LB_START || buf[15] !== LB_STOP) return null;

   const crc = crc8LoadBank(buf);
   if (buf[14] !== crc) return null;

   const version = decodeU8(buf[1]);
   const bankPowerA = decodeU8(buf[2]);
   const bankPowerB = decodeU8(buf[3]);
   const bankNo = decodeU8(buf[4]);
   const contactorsMaskA = decodeU8(buf[5]);
   const contactorsMaskB = decodeU8(buf[6]);
   const errContactorsA = decodeU8(buf[7]);
   const errContactorsB = decodeU8(buf[8]);
   const errFansA = decodeU8(buf[9]);
   const errFansB = decodeU8(buf[10]);
   const errThermalsA = decodeU8(buf[11]);
   const errThermalsB = decodeU8(buf[12]);
   const otherErrors = decodeU8(buf[13]);

   return {
      version,
      bankPowerA,
      bankPowerB,
      bankNo,
      contactorsMaskA,
      contactorsMaskB,
      errContactorsA,
      errContactorsB,
      errFansA,
      errFansB,
      errThermalsA,
      errThermalsB,
      otherErrors,
   };
}
*/

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

   frame[14] = crc8LoadBank(frame);
   frame[15] = LB_STOP;

   return frame;
}

/*
export function buildLoadBankFrameDev(input: LoadBankFrameDev ): Uint8Array {
   const frame = new Uint8Array(LB_FRAME_LEN);

   frame[0] = LB_START;
   frame[1] = encodeU8(input.version);

   frame[2] = encodeU8(input.bankPowerA ?? 0); 
   frame[3] = encodeU8(input.bankPowerB ?? 0);

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
   // register this subscriber
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

      // attach a temporary subscriber to ALL sessions for this port (usually 1)
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

      // immediate check with last known state
      const last = getLastLoadBankStatus(portName);
      if (last) tick(last);
   });
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
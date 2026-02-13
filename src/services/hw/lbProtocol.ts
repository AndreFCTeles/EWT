import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { CRC8_TABLE, LB_FRAME_LEN} from "@/types/loadBankTypes";
import type { LoadBankStatus, LoadBankHealth, LoadBankFrame } from "@/types/loadBankTypes"; 
import { 
   DEV_ECHO_BAUD, 
   DEV_ECHO_DELAY, 
   DEV_ECHO_PORT
} from "@/dev/devConfig";






function crc8LoadBank(frame: Uint8Array): number {
   if (frame.length < LB_FRAME_LEN) {
      throw new Error(`frame too short for CRC : frame length ${frame.length} != ${LB_FRAME_LEN}`);
   }
   let crc = 0;
   for (let i = 0; i < LB_FRAME_LEN-1; i++) { 
      crc = CRC8_TABLE[crc ^ frame[i]]; 
   }
   return crc;
}




// Clamping
function clampU8(v: number): number {
   if (!Number.isInteger(v) || v < 0 || v > 0xFF) { throw new Error(`U8 out of range: ${v}`); }
   return v; // & 0xFF;
}

function clampU16(v: number): number {
   if (!Number.isInteger(v) || v < 0 || v > 0xFFFF) { throw new Error(`U16 out of range: ${v}`); }
   return v; // & 0xFFFF;
}

function u16ToBytes(v: number): [number, number] {
   const val = clampU16(v);
   const hi = (val >> 8); // & 0xFF;
   const lo = val; // & 0xFF;
   return [hi, lo];
}

function bytesToU16(hi: number, lo: number): number {
   return (hi << 8 | lo); // ((hi & 0xFF) << 8) | (lo & 0xFF);
}





export function buildLoadBankFrame(BufferTx: LoadBankFrame): Uint8Array {
   const frame = new Uint8Array(LB_FRAME_LEN);

   // version
   frame[0] = clampU8(BufferTx.version);

   // power
   const [pHi, pLo] = u16ToBytes(BufferTx.bankPower);
   frame[1] = pHi;
   frame[2] = pLo;
   // bankId
   frame[3] = clampU8(BufferTx.bankNo);
   // contactors
   const [cHi, cLo] = u16ToBytes(BufferTx.contactorsMask);
   frame[4] = cHi;
   frame[5] = cLo;

   // errContactores
   const [ecHi, ecLo] = u16ToBytes(BufferTx.errContactors ?? 0);
   frame[6] = ecHi;
   frame[7] = ecLo;
   
   // errFans
   const [efHi, efLo] = u16ToBytes(BufferTx.errFans ?? 0);
   frame[8] = efHi;
   frame[9] = efLo;

   // errThermals
   const [etHi, etLo] = u16ToBytes(BufferTx.errThermals ?? 0);
   frame[10] = etHi;
   frame[11] = etLo;

   // errOther
   frame[12] = clampU8(BufferTx.otherErrors ?? 0);
   
   // CRC
   frame[13] = crc8LoadBank(frame);

   return frame;
}



export function parseLoadBankFrame(BufferRx: Uint8Array): LoadBankFrame | null {
   if (BufferRx.length !== LB_FRAME_LEN) return null; 
   const expectedCrc = crc8LoadBank(BufferRx);  
   if (BufferRx[13] !== expectedCrc) return null;

   const version = BufferRx[0];
   const bankPower = bytesToU16(BufferRx[1], BufferRx[2]);
   const bankNo = BufferRx[3];
   const contactorsMask = bytesToU16(BufferRx[4], BufferRx[5]);
   const errContactors = bytesToU16(BufferRx[6], BufferRx[7]);
   const errFans = bytesToU16(BufferRx[8], BufferRx[9]);
   const errThermals = bytesToU16(BufferRx[10], BufferRx[11]);
   const otherErrors = BufferRx[12];

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
         if (s.contactorsMask ?? 0 === expectedMask) {
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










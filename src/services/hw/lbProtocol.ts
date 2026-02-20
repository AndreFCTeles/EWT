import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { CRC8_TABLE, LB_FRAME_LEN} from "@/types/loadBankTypes";
import type { LoadBankStatus, LoadBankHealth, LoadBankFrame } from "@/types/loadBankTypes"; 
import { 
   DEV_ECHO_BAUD, 
   DEV_ECHO_DELAY, 
   DEV_ECHO_PORT
} from "@/dev/devConfig";
import { toHex } from "../utils/generalUtils";





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
   // Connecton Health
   frame[4] = clampU8(BufferTx.bankHealth);
   // contactors
   const [cHi, cLo] = u16ToBytes(BufferTx.contactorsMask);
   frame[5] = cHi;
   frame[6] = cLo;

   // errContactores
   const [ecHi, ecLo] = u16ToBytes(BufferTx.errContactors ?? 0);
   frame[7] = ecHi;
   frame[8] = ecLo;
   
   // errFans
   const [efHi, efLo] = u16ToBytes(BufferTx.errFans ?? 0);
   frame[9] = efHi;
   frame[10] = efLo;

   // errThermals
   const [etHi, etLo] = u16ToBytes(BufferTx.errThermals ?? 0);
   frame[11] = etHi;
   frame[12] = etLo;

   // errOther
   frame[13] = clampU8(BufferTx.otherErrors ?? 0);
   
   // CRC
   frame[14] = crc8LoadBank(frame);

   return frame;
}



export function parseLoadBankFrame(BufferRx: Uint8Array): LoadBankFrame | null {
   if (BufferRx.length !== LB_FRAME_LEN) return null; 
   const expectedCrc = crc8LoadBank(BufferRx);  
   if (BufferRx[LB_FRAME_LEN - 1] !== expectedCrc) return null;

   const version = BufferRx[0];
   const bankPower = bytesToU16(BufferRx[1], BufferRx[2]);
   const bankNo = BufferRx[3];
   const bankHealth = BufferRx[4];
   const contactorsMask = bytesToU16(BufferRx[5], BufferRx[6]);
   const errContactors = bytesToU16(BufferRx[7], BufferRx[8]);
   const errFans = bytesToU16(BufferRx[9], BufferRx[10]);
   const errThermals = bytesToU16(BufferRx[11], BufferRx[12]);
   const otherErrors = BufferRx[13];

   return {
      version,
      bankPower,
      bankNo,
      bankHealth,
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
type RxCb = (chunk: Uint8Array) => void;
type TxCb = (frame: Uint8Array) => void;

type SessionKey = string; // `${portName}:${baud}`

type Session = {
   key: SessionKey; // use sessionkey as identifier? Y tho?
   portName: string;
   baud: number;

   statusCbs: Set<StatusCb>;
   healthCbs: Set<HealthCb>;
   rxCbs: Set<RxCb>;
   txCbs: Set<TxCb>;

   unlistenStatus?: UnlistenFn;
   unlistenHealth?: UnlistenFn;
   unlistenRx?: UnlistenFn;
   unlistenTx?: UnlistenFn;

   stopping?: Promise<void>;
};

// cache
const sessions = new Map<SessionKey, Session>();
let activeKey: SessionKey | null = null;

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


// DESTROY ALL SESSIONS MUAHAHA
async function teardownSession(sess: Session, callBackendStop: boolean): Promise<void> {
   // stop once
   if (!sess.stopping) {
      sess.stopping = (async () => {
         try { sess.unlistenStatus?.(); } catch {}
         try { sess.unlistenHealth?.(); } catch {}
         try { sess.unlistenRx?.(); } catch {}
         try { sess.unlistenTx?.(); } catch {}

         if (callBackendStop) { await invoke("lb_stop_polling").catch(() => {}); }

         sessions.delete(sess.key);
         if (activeKey === sess.key) activeKey = null;
      })();
   }
   await sess.stopping;
}
// TO ENSURE SINGLE SESSION
async function ensureSingleActiveSession(nextKey: SessionKey): Promise<void> {
   if (activeKey && activeKey !== nextKey) {
      const old = sessions.get(activeKey);
      if (old) {
         // We don't call lb_stop_polling here because lb_start_polling will replace the backend runtime.
         await teardownSession(old, false);
      } else {
         activeKey = null;
      }
   }
   activeKey = nextKey;
}



export async function startLoadBankPolling(
   portName: string,
   onStatus: StatusCb,
   baud?: number,
   abortSignal?: AbortSignal,
   onHealth?: HealthCb,
   onRx?: RxCb,
   onTx?: TxCb
): Promise<() => Promise<void>> {
   const baudFinal = baud ?? DEV_ECHO_BAUD;
   const key = keyOf(portName, baudFinal);
   let session = sessions.get(key);
   await ensureSingleActiveSession(key);

   if (!session) {
      session = {
         key,
         portName,
         baud: baudFinal,
         statusCbs: new Set(),
         healthCbs: new Set(),
         rxCbs: new Set(),
         txCbs: new Set(),
      };
      sessions.set(key, session);
      activeKey = key;

      // start backend runtime ONLY once! (After absolutely smashing all others with ensureSingleActiveSession)
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

      // Raw stream chunks (for terminal/debug views)
      session.unlistenRx = await listen<{ portName: string; bytes: number[] }>("lb/rx", (e) => {
         const payload = e.payload;
         if (payload.portName !== portName) return;
         if (session!.rxCbs.size === 0) return;
         const chunk = Uint8Array.from(payload.bytes);
         for (const cb of session!.rxCbs) cb(chunk);
      });
      // TX frames (write + optional polling)
      session.unlistenTx = await listen<{ portName: string; bytes: number[] }>("lb/tx", (e) => {
         const payload = e.payload;
         if (payload.portName !== portName) return;
         if (session!.txCbs.size === 0) return;
         const frame = Uint8Array.from(payload.bytes);
         for (const cb of session!.txCbs) cb(frame);
      });
   }

   // register subscriber - TODO: wtf is dis lmao
   session.statusCbs.add(onStatus);
   if (onHealth) session.healthCbs.add(onHealth);
   if (onRx) session.rxCbs.add(onRx);
   if (onTx) session.txCbs.add(onTx);

   
   /*
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
   */

   // new STOP tears down all sessions
   const stop = async (): Promise<void> => {
      const s = sessions.get(key);
      if (!s) return;

      s.statusCbs.delete(onStatus);
      if (onHealth) s.healthCbs.delete(onHealth);
      if (onRx) s.rxCbs.delete(onRx);
      if (onTx) s.txCbs.delete(onTx);

      // Keep backend running if someone is still listening.
      if (s.statusCbs.size > 0 || s.healthCbs.size > 0 || s.rxCbs.size > 0 || s.txCbs.size > 0) return;

      await teardownSession(s, true);
   };

   if (abortSignal && abortSignal.aborted) {
      await stop();
      return stop;
   }
   if (abortSignal && !abortSignal.aborted)
   abortSignal.addEventListener("abort", () => { void stop(); }, { once: true });

   return stop;
}

export async function lbWriteBytes(frame: Uint8Array) {
   console.log("[LB/TX]", toHex(frame));
   await invoke("lb_write_bytes", { data: Array.from(frame) });
}


export async function lbSetPolling(
   enabled: boolean, 
   intervalMs: number,
   frame: Uint8Array
) {
   await invoke("lb_set_polling", {
      enabled,
      intervalMs,
      frame: Array.from(frame),
   });
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
         const last = getLastLoadBankStatus(portName);
         reject(
            new Error(
               `[LB] timeout waiting for mask 0x${expectedMask.toString(16)} (last=0x${(last?.contactorsMask ?? 0).toString(16)})`
            )
         );
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



// ──────────────────────────────────────────────────────────────────────────────
// Optional Debuggers
// ──────────────────────────────────────────────────────────────────────────────

// old debug
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

// New (and improved) debugger
export async function attachConsoleTerminal(
   portName: string,
   baud?: number,
   abortSignal?: AbortSignal
): Promise<() => Promise<void>> {
   return startLoadBankPolling(
      portName,
      () => {},
      baud,
      abortSignal,
      undefined,
      (chunk) => {
         // Hex + UTF-8-ish view
         const text = new TextDecoder("utf-8", { fatal: false }).decode(chunk);
         console.log(`[LB/RX] ${toHex(chunk)} | ${JSON.stringify(text)}`);
      },
      (frame) => {
         console.log(`[LB/TX] ${toHex(frame)}`);
      }
   );
}

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { CRC8_TABLE, LB_FRAME_LEN } from "@/types/loadBankTypes";
import type {
   LoadBankFrame,
   LoadBankHealth,
   LoadBankStatus,
   SerialRxChunk,
   SerialTxChunk,
   PortsEvent,
} from "@/types/loadBankTypes";
import { DEV_ECHO_BAUD } from "@/dev/devConfig";
import { toHex } from "../utils/generalUtils";

// -----------------------------------------------------------------------------
// Frame helpers (DEV / UI helpers). Production should call backend commands.
// -----------------------------------------------------------------------------

function crc8LoadBank(frame: Uint8Array): number {
   if (frame.length !== LB_FRAME_LEN) {
      throw new Error(`frame length ${frame.length} != LB_FRAME_LEN=${LB_FRAME_LEN}`);
   }
   let crc = 0;
   for (let i = 0; i < LB_FRAME_LEN - 1; i++) {
      crc = CRC8_TABLE[crc ^ frame[i]];
   }
   return crc;
}

function clampU8(v: number): number {
   if (!Number.isInteger(v) || v < 0 || v > 0xff) throw new Error(`U8 out of range: ${v}`);
   return v;
}

function clampU16(v: number): number {
   if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new Error(`U16 out of range: ${v}`);
   return v;
}

function u16ToBytes(v: number): [number, number] {
   const val = clampU16(v);
   return [(val >> 8) & 0xff, val & 0xff];
}

function bytesToU16(hi: number, lo: number): number {
   return ((hi & 0xff) << 8) | (lo & 0xff);
}

export function buildLoadBankFrame(tx: LoadBankFrame): Uint8Array {
   const frame = new Uint8Array(LB_FRAME_LEN);
   frame[0] = clampU8(tx.version);
   const [pHi, pLo] = u16ToBytes(tx.bankPower);
   frame[1] = pHi;
   frame[2] = pLo;
   frame[3] = clampU8(tx.bankNo);
   frame[4] = clampU8(tx.handshake);
   const [cHi, cLo] = u16ToBytes(tx.contactorsMask);
   frame[5] = cHi;
   frame[6] = cLo;
   const [ecHi, ecLo] = u16ToBytes(tx.errContactors ?? 0);
   frame[7] = ecHi;
   frame[8] = ecLo;
   const [efHi, efLo] = u16ToBytes(tx.errFans ?? 0);
   frame[9] = efHi;
   frame[10] = efLo;
   const [etHi, etLo] = u16ToBytes(tx.errThermals ?? 0);
   frame[11] = etHi;
   frame[12] = etLo;
   frame[13] = clampU8(tx.otherErrors ?? 0);
   frame[14] = crc8LoadBank(frame);
   return frame;
}

export function parseLoadBankFrame(rx: Uint8Array): LoadBankFrame | null {
   if (rx.length !== LB_FRAME_LEN) return null;
   const expected = crc8LoadBank(rx);
   if (rx[14] !== expected) return null;

   return {
      version: rx[0],
      bankPower: bytesToU16(rx[1], rx[2]),
      bankNo: rx[3],
      handshake: rx[4],
      contactorsMask: bytesToU16(rx[5], rx[6]),
      errContactors: bytesToU16(rx[7], rx[8]),
      errFans: bytesToU16(rx[9], rx[10]),
      errThermals: bytesToU16(rx[11], rx[12]),
      otherErrors: rx[13],
   };
}

// -----------------------------------------------------------------------------
// Backend runtime control
// -----------------------------------------------------------------------------

export async function lbEnsureRuntimeAuto(opts?: { baud?: number }) {
   await ensureListeners();
   await invoke("lb_start_polling", { portName: "", baud: opts?.baud ?? DEV_ECHO_BAUD });
}

export async function lbEnsureRuntimeFixed(portName: string, opts?: { baud?: number }) {
   await ensureListeners();
   await invoke("lb_start_polling", { portName, baud: opts?.baud ?? DEV_ECHO_BAUD });
}

export async function lbStopRuntime() {
   await invoke("lb_stop_polling").catch(() => {});
}

export async function lbSetPolling(enabled: boolean, intervalMs: number) {
   await invoke("lb_set_polling", { enabled, intervalMs });
}

// Raw send
export async function lbWriteBytes(bytes: Uint8Array) {
   console.log("[LB/TX]", toHex(bytes));
   await invoke("lb_write_bytes", { data: Array.from(bytes) });
}

// Production: backend builds frame
export async function lbSetContactors(mask: number) {
   const m = clampU16(mask);
   await invoke("lb_set_contactors", { mask: m });
}

// -----------------------------------------------------------------------------
// Event bus (frontend is event-driven; no polling loops here)
// -----------------------------------------------------------------------------

type StatusCb = (s: LoadBankStatus) => void;
type HealthCb = (h: LoadBankHealth) => void;
type PortsCb = (p: PortsEvent) => void;
type RxCb = (c: SerialRxChunk) => void;
type TxCb = (c: SerialTxChunk) => void;

const statusCbs = new Set<StatusCb>();
const healthCbs = new Set<HealthCb>();
const portsCbs = new Set<PortsCb>();
const rxCbs = new Set<RxCb>();
const txCbs = new Set<TxCb>();

let lastStatus: LoadBankStatus | null = null;
let lastHealth: LoadBankHealth | null = null;
let lastPorts: string[] = [];

let listenersReady: Promise<void> | null = null;
let unlistenFns: UnlistenFn[] = [];

async function ensureListeners() {
   if (listenersReady) return listenersReady;

   listenersReady = (async () => {
      unlistenFns.push(
         await listen<LoadBankStatus>("lb/status", (e) => {
         lastStatus = e.payload;
         for (const cb of statusCbs) cb(e.payload);
         })
      );

      unlistenFns.push(
         await listen<LoadBankHealth>("lb/health", (e) => {
         lastHealth = e.payload;
         for (const cb of healthCbs) cb(e.payload);
         })
      );

      unlistenFns.push(
         await listen<PortsEvent>("lb/ports", (e) => {
         lastPorts = e.payload.ports;
         for (const cb of portsCbs) cb(e.payload);
         })
      );

      unlistenFns.push(
         await listen<SerialRxChunk>("lb/rx", (e) => {
         for (const cb of rxCbs) cb(e.payload);
         })
      );

      unlistenFns.push(
         await listen<SerialTxChunk>("lb/tx", (e) => {
         for (const cb of txCbs) cb(e.payload);
         })
      );
   })();

   return listenersReady;
}

export function getLastLoadBankStatus(): LoadBankStatus | null {
   return lastStatus;
}

export function getLastLoadBankHealth(): LoadBankHealth | null {
   return lastHealth;
}

export function getLastPorts(): string[] {
   return lastPorts;
}

export async function subscribeLoadBankStatus(cb: StatusCb): Promise<() => void> {
   await ensureListeners();
   statusCbs.add(cb);
   if (lastStatus) cb(lastStatus);
   return () => statusCbs.delete(cb);
}

export async function subscribeLoadBankHealth(cb: HealthCb): Promise<() => void> {
   await ensureListeners();
   healthCbs.add(cb);
   if (lastHealth) cb(lastHealth);
   return () => healthCbs.delete(cb);
}

export async function subscribePorts(cb: PortsCb): Promise<() => void> {
   await ensureListeners();
   portsCbs.add(cb);
   if (lastPorts.length) cb({ ports: lastPorts });
   return () => portsCbs.delete(cb);
}

export async function subscribeRx(cb: RxCb): Promise<() => void> {
   await ensureListeners();
   rxCbs.add(cb);
   return () => rxCbs.delete(cb);
}

export async function subscribeTx(cb: TxCb): Promise<() => void> {
   await ensureListeners();
   txCbs.add(cb);
   return () => txCbs.delete(cb);
}

// Await a status that matches a mask
export async function waitForLoadBankMask(expectedMask: number, cfg: { timeoutMs?: number } = {}) {
   const timeoutMs = cfg.timeoutMs ?? 2000;
   const exp = clampU16(expectedMask);

   const existing = lastStatus;
   if (existing && (existing.contactorsMask ?? 0) === exp) {
      return existing;
   }

   await ensureListeners();

   return new Promise<LoadBankStatus>((resolve, reject) => {
      const t = window.setTimeout(() => {
         off();
         reject(new Error(`[LB] timeout waiting for mask 0x${exp.toString(16)}`));
      }, timeoutMs);

      const handler = (s: LoadBankStatus) => {
         if ((s.contactorsMask ?? 0) === exp) {
         window.clearTimeout(t);
         off();
         resolve(s);
         }
      };

      const off = () => statusCbs.delete(handler);
      statusCbs.add(handler);
   });
}


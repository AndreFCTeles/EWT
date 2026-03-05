import type { LoadBankHealth, LoadBankProbe, LoadBankStatus } from "@/types/loadBankTypes";
import {
   lbEnsureRuntimeAuto,
   subscribeLoadBankHealth,
   subscribeLoadBankStatus,
   getLastLoadBankHealth,
   getLastLoadBankStatus,
} from "@/services/hw/lbProtocol";





type Phase = "idle" | "searching" | "connected";

type State = {
   phase: Phase;
   portName: string | null;
   online: boolean | null;
   reason?: string | null;

   status: LoadBankStatus | null;
   health: LoadBankHealth | null;
   
   bankPower?: number;
   bankNo?: number;
   handshake?: number;
   hasErrors?: boolean;
};

let state: State = {
   phase: "idle",
   portName: null,
   online: null,
   reason: null,
   status: null,
   health: null,
};

const subs = new Set<() => void>();

function emitIfChanged(next: State) {
   const same =
      state.phase === next.phase &&
      state.portName === next.portName &&
      state.online === next.online &&
      state.reason === next.reason &&
      state.status === next.status &&
      state.health === next.health &&
      state.bankPower === next.bankPower &&
      state.bankNo === next.bankNo &&
      state.handshake === next.handshake &&
      state.hasErrors === next.hasErrors;

   if (same) return;
   state = next;
   subs.forEach((fn) => fn());
}

export function getLBState() {
   return state;
}

export function subscribeLB(fn: () => void) {
   subs.add(fn);
   return () => subs.delete(fn);
}

let inited = false;
let unsubHealth: null | (() => void) = null;
let unsubStatus: null | (() => void) = null;
let initPromise: Promise<void> | null = null;

async function attachEventStreams() {
   if (unsubHealth || unsubStatus) return;

   unsubStatus = await subscribeLoadBankStatus((s: LoadBankStatus) => {
      // Receiving a valid status implies connection to a real device
      emitIfChanged({
         ...state,
         phase: "connected",
         portName: s.portName ?? state.portName,
         online: true, 
         reason: null,
         status: s,
         bankPower: s.bankPower,
         bankNo: s.bankNo,
         handshake: s.handshake,
         hasErrors: Boolean(s.errContactors || s.errFans || s.errThermals || s.otherErrors),
      });
   });

   unsubHealth = await subscribeLoadBankHealth((h: LoadBankHealth) => {
      // Health online=false → scanning again → searching
      const nextPhase: Phase = h.online ? "connected" : "searching";

      emitIfChanged({
         ...state,
         phase: nextPhase,
         portName: h.portName || state.portName,
         online: h.online,
         reason: h.reason ?? null,
         health: h,
      });
   });

   // seed state if runtime already has cached values
   const lastH = getLastLoadBankHealth();
   const lastS = getLastLoadBankStatus();

   if (lastH) {
      emitIfChanged({
         ...state,
         phase: lastH.online ? "connected" : "searching",
         portName: lastH.portName || state.portName,
         online: lastH.online,
         reason: lastH.reason ?? null,
         health: lastH,
      });
   }
   if (lastS) {
      emitIfChanged({
         ...state,
         phase: "connected",
         portName: lastS.portName || state.portName,
         online: true,
         reason: null,
         status: lastS,
         bankPower: lastS.bankPower,
         bankNo: lastS.bankNo,
         handshake: lastS.handshake,
         hasErrors: Boolean(lastS.errContactors || lastS.errFans || lastS.errThermals || lastS.otherErrors),
      });
   }
}

/** Start backend runtime (AUTO hotplug) and attach listeners. Non-blocking for UI. */
export async function initLoadBankMonitoring() {
   if (initPromise) return initPromise;

   initPromise = (async () => {
      if (!inited) {
         inited = true;
         emitIfChanged({ ...state, phase: "searching" });
      }

      await attachEventStreams();

      // Kick runtime into AUTO mode (Rust scans/hotplugs in background)
      await lbEnsureRuntimeAuto();
   })();

   return initPromise;
}

export function getLoadBankProbeSnapshot(): LoadBankProbe {
   const s = state.status;
   if (!state.portName || !s) return { connected: false };

   return {
      connected: true,
      portName: state.portName,
      status: s,
      bank_power: s.bankPower,
      bank_no: s.bankNo,
      handshake: s.handshake,
   };
}

/** For steps that truly require LB, they can call this (optionally with timeout). */
export async function waitForLoadBankConnected(timeoutMs = 2500): Promise<LoadBankProbe> {
   await initLoadBankMonitoring();

   const snap = getLoadBankProbeSnapshot();
   if (snap.connected) return snap;

   return new Promise((resolve) => {
      const start = Date.now();
      const unsub = subscribeLB(() => {
         const s2 = getLoadBankProbeSnapshot();
         if (s2.connected) {
            unsub();
            resolve(s2);
            return;
         }
         if (Date.now() - start > timeoutMs) {
            unsub();
            resolve({ connected: false });
         }
      });

      // fail-safe timeout
      window.setTimeout(() => {
         try { unsub(); } catch { /* ignore */ }
         resolve({ connected: false });
      }, timeoutMs);
   });
}

/** Backwards-compatible helper. */
export async function ensureLoadBankConnected() {
   await initLoadBankMonitoring();
}
import { invoke } from "@tauri-apps/api/core";
import type { LoadBankHealth, LoadBankStatus, LoadBankProbe } from "@/types/loadBankTypes";
import { detectLoadBank } from "@/services/hw/hardware";
import { startLoadBankPolling } from "@/services/hw/lbProtocol";

type State = {
   phase: "idle" | "probing" | "connected" | "offline";
   portName: string | null;
   online: boolean | null;           // null until first health result
   reason?: string | null;

   bankPower?: number;
   bankNo?: number;
   bankHealth?: number;
   hasErrors?: boolean;
};

let state: State = { 
   phase: "idle", 
   portName: null, 
   online: null 
};
const subs = new Set<() => void>();

function emitIfChanged(next: State) {
   const same =
      state.phase === next.phase &&
      state.portName === next.portName &&
      state.online === next.online &&
      state.reason === next.reason &&
      state.bankPower === next.bankPower &&
      state.bankNo === next.bankNo &&
      state.bankHealth === next.bankHealth &&
      state.hasErrors === next.hasErrors;

   if (same) return;
   state = next;
   subs.forEach((fn) => fn());
}

export function getLBState() { return state; }
export function subscribeLB(fn: () => void) { 
   subs.add(fn); 
   return () => subs.delete(fn); 
}

let stopPolling: null | (() => Promise<void>) = null;
let stopAbort: null | (() => void) = null; // keep?

let initInFlight: Promise<LoadBankProbe> | null = null;
let autoDetectTimer: number | null = null;
let lastPortsKey = "";

async function attachPolling(portName: string) {
   if (stopPolling) {
      await stopPolling().catch(() => {});
      stopPolling = null;
   }
   if (stopAbort) {
      stopAbort();
      stopAbort = null;
   }

   const ac = new AbortController();
   stopAbort = () => ac.abort();

   stopPolling = await startLoadBankPolling(
      portName,
      (s: LoadBankStatus) => {
         emitIfChanged({
            ...state,
            phase: "connected",
            portName,
            bankPower: s.bankPower,
            bankNo: s.bankNo,
            bankHealth: s.bankHealth,
            hasErrors: Boolean(
               s.errContactors || 
               s.errFans || 
               s.errThermals || 
               s.otherErrors
            ),
         });
      },
      undefined, // baud
      ac.signal, // abortSignal
      (h: LoadBankHealth) => {
         emitIfChanged({
            ...state,
            phase: h.online ? "connected" : "offline",
            portName,
            online: h.online,
            reason: h.reason ?? null,
         });
      }
   );

   stopPolling = async () => {
      ac.abort();
      stop();
   };
}

/** App mount: probe and start monitoring */
export async function initLoadBankMonitoring() {
   if (initInFlight) return initInFlight;

   initInFlight = (async () => {
      emitIfChanged({ 
         phase: "probing", 
         portName: null, 
         online: null 
      });

      const probe: LoadBankProbe = await detectLoadBank();

      if (!probe.connected) {
         emitIfChanged({ 
            phase: "offline", 
            portName: null, 
            online: false, 
            reason: "not found" 
         });
         return probe;
      }

      emitIfChanged({
         phase: "connected",
         portName: probe.portName,
         online: null,
         bankPower: probe.bank_power,
         bankNo: probe.bank_no,
         bankHealth: probe.bank_health,
      });

      await attachPolling(probe.portName);
      return probe;
   })();

   try {
      return await initInFlight;
   } finally {
      initInFlight = null;
   }
}

/** Step mount (LBCalStep): force refresh/reconnect */
export async function ensureLoadBankConnected() {
   if (state.portName && state.online === true) return;
   await initLoadBankMonitoring();
}




/** Start a lightweight port watcher to auto-detect newly plugged devices. Call once on app startup. */
export function startLoadBankAutoDetect(cfg: { intervalMs?: number } = {}) {
   const intervalMs = cfg.intervalMs ?? 1500;
   if (autoDetectTimer) return () => stopLoadBankAutoDetect();

   const tick = async () => {
      try {
         const ports = await invoke<string[]>("list_ports_detailed");
         const key = ports.join("|");
         const changed = key !== lastPortsKey;
         lastPortsKey = key;

         const shouldProbe =
            state.phase === "idle" ||
            state.phase === "offline" ||
            state.portName === null ||
            state.online === false;

         // Only re-probe when we have reason to (offline / not found / disconnected),
         // and either ports changed or we're still not connected.
         if (shouldProbe && (changed || state.phase === "offline")) {
            void initLoadBankMonitoring();
         }

         // If we think we are on a port that disappeared, mark offline and re-probe.
         if (state.portName && ports.length && !ports.includes(state.portName)) {
            emitIfChanged({
               ...state,
               phase: "offline",
               online: false,
               reason: "port disappeared",
            });
            void initLoadBankMonitoring();
         }
      } catch {
         // ignore transient errors
      }
   };

   autoDetectTimer = window.setInterval(() => { void tick(); }, intervalMs);
   void tick();

   return () => stopLoadBankAutoDetect();
}

export function stopLoadBankAutoDetect() {
   if (autoDetectTimer) {
      clearInterval(autoDetectTimer);
      autoDetectTimer = null;
   }
}


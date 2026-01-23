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

async function attachPolling(portName: string) {
   if (stopPolling) {
      await stopPolling().catch(() => {});
      stopPolling = null;
   }

   const ac = new AbortController();

   stopPolling = await startLoadBankPolling(
      portName,
      (s: LoadBankStatus) => {
         emitIfChanged({
            ...state,
            phase: "connected",
            portName,
            bankPower: s.bankPower,
            bankNo: s.bankNo,
            hasErrors: Boolean(
               s.errContactors || 
               s.errFans || 
               s.errThermals || 
               s.otherErrors
            ),
         });
      },
      ac.signal,
      undefined,
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
}

/** App mount: probe and start monitoring */
export async function initLoadBankMonitoring() {
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
   });

   await attachPolling(probe.portName);
   return probe;
}

/** Step mount (LBCalStep): force refresh/reconnect */
export async function ensureLoadBankConnected() {
   if (state.portName && state.online === true) return;
   await initLoadBankMonitoring();
}

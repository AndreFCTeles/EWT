/*import { useEffect, useMemo, useState } from "react";
import type { LoadBankLive, LoadBankStatus, LoadBankHealth } from "@/types/loadBankTypes";
import { getLastLoadBankStatus, startLoadBankPolling } from "@/services/hw/lbProtocol";
import { DEV_ECHO_BAUD } from "@/dev/devConfig";


export default function useLoadBankLive(portName: string | null): LoadBankLive {
   const [status, setStatus] = useState<LoadBankStatus | null>(null);
   const [health, setHealth] = useState<LoadBankHealth | null>(null);

   useEffect(() => {
      if (!portName) {
         setStatus(null);
         setHealth(null);
         return;
      }

      // seed with last known status (lbProtocol keeps a cache)
      const last = getLastLoadBankStatus(portName);
      if (last) setStatus(last);

      const ac = new AbortController();
      (async () => {
         await startLoadBankPolling(
            portName,
            (s: LoadBankStatus) => setStatus(s),
            DEV_ECHO_BAUD,
            ac.signal,
            (h: LoadBankHealth) => setHealth(h)
         );
      })().catch(console.error);

      return () => {
         ac.abort();
         void stop?.()
      }
   }, [portName]);

   return useMemo(() => {
      const online = health?.online ?? false;
      return { portName, status, health, online };
   }, [portName, status, health]);
}*/

import { useLoadBankRuntime } from "./useLoadBankRuntime";

/** Convenience wrapper around the runtime store state */
export function useLBHealth(cfg?: { autoStart?: boolean }) {
   const rt = useLoadBankRuntime({ autoStart: cfg?.autoStart });

   return {
      phase: rt.phase,
      portName: rt.portName,
      online: rt.online,
      reason: rt.reason,
      bankPower: rt.bankPower,
      bankNo: rt.bankNo,
      bankHealth: rt.bankHealth,
      hasErrors: rt.hasErrors,
      lastStatus: rt.lastStatus,
      lastHealth: rt.lastHealth,

      initLoadBankMonitoring: rt.initLoadBankMonitoring,
      ensureLoadBankConnected: rt.ensureLoadBankConnected,
      stopLoadBankAutoDetect: rt.stopLoadBankAutoDetect,
   };
}

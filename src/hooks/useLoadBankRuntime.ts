import { useEffect, useSyncExternalStore } from "react";
import { ensureLoadBankConnected, getLBState, initLoadBankMonitoring, stopLoadBankAutoDetect, subscribeLB } from "@/services/hw/loadBankRuntimeStore";

export function useLoadBankRuntime(cfg?: { autoStart?: boolean }) {
   const snap = useSyncExternalStore(subscribeLB, getLBState, getLBState);
   
   useEffect(() => {
      if (cfg?.autoStart === false) return;
      void initLoadBankMonitoring();
   }, []);

   return {
      ...snap,
      initLoadBankMonitoring,
      ensureLoadBankConnected,
      stopLoadBankAutoDetect, // rename?
   };
}

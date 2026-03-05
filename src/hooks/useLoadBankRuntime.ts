import { useSyncExternalStore } from "react"; //useEffect, 
import { getLBState, subscribeLB } from "@/services/hw/loadBankRuntimeStore"; // ensureLoadBankConnected, initLoadBankMonitoring, stopLoadBankAutoDetect, 

/*
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
*/
export function useLoadBankRuntime() {
   return useSyncExternalStore(subscribeLB, getLBState, getLBState);
}

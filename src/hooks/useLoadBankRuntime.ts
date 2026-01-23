import { useSyncExternalStore } from "react";
import { getLBState, subscribeLB } from "@/services/hw/loadBankRuntimeStore";

export function useLoadBankRuntime() {
   return useSyncExternalStore(subscribeLB, getLBState, getLBState);
}

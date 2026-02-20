import { useEffect, useMemo, useState } from "react";
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
            (s) => setStatus(s),
            DEV_ECHO_BAUD,
            ac.signal,
            (h) => setHealth(h)
         );
      })().catch(console.error);

      return () => ac.abort();
   }, [portName]);

   return useMemo(() => {
      const online = health?.online ?? false;
      return { portName, status, health, online };
   }, [portName, status, health]);
}


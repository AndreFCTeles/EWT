import { useEffect, useMemo, useState } from "react";
//import { listSimpleCalibrations } from "@/services/api/toolData/toolApi";
import { 
   getLatestCalibration,
   flushPendingQueue, 
   //ensureLatestCached,
   //listCalibrationsOffline,
   //listCalibrationsSmart,
   checkOnline,
   ensureCacheServerSync,
   refreshCacheFromServer
} from "@/services/api/toolData/toolApi.offline";
import type { SimpleCalibration } from "@/types/toolCalTypes";
import { listSimpleCalibrations } from "@/services/api/toolData/toolApi";



export const useCalibrations = (params: {
   instrumentCode?: string;
   verifiedAt?: string;
   limit?: number;
   onlyUsable?: boolean; // client-side filter
}) => {
   const [data, setData] = useState<SimpleCalibration[] | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setErr] = useState<Error | null>(null);

   useEffect(() => {
      const ac = new AbortController();
      (async () => {
         setLoading(true); 
         setErr(null);
         try {
            const rows = await listSimpleCalibrations({
               instrumentCode: params.instrumentCode,
               verifiedAt: params.verifiedAt,
               limit: params.limit,
            });
            if (!ac.signal.aborted) setData(rows ?? []);
         } 
         catch (e) { if (!ac.signal.aborted) setErr(e as Error); } 
         finally { if (!ac.signal.aborted) setLoading(false); }
      })();
      return () => ac.abort();
   }, [params.instrumentCode, params.verifiedAt, params.limit]);

   const filtered = useMemo(() => {
      if (!data) return null;
      if (!params.onlyUsable) return data;
      return data.map((d) => ({
         ...d,
         tests: d.tests.filter((t) => t.usable !== false),
      }));
   }, [data, params.onlyUsable]);

   return { data: filtered, loading, error };
}



export const useLatestCalibration = (instrumentCode?: string) => {
   const [data, setData] = useState<SimpleCalibration | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setErr] = useState<Error | null>(null);
   const [tick, setTick] = useState(0);
   const reload = () => setTick(n => n + 1);

   useEffect(() => {
      if (!instrumentCode) { 
         setData(null);
         return; 
      }
      const ac = new AbortController();

      (async () => {
         setLoading(true); 
         setErr(null);

         try {
            const cached = await getLatestCalibration(instrumentCode);
            if (!ac.signal.aborted) setData(cached);
         } 
         catch (e) { if (!ac.signal.aborted) setErr(e as Error); } 
         finally { if (!ac.signal.aborted) setLoading(false); }

         flushPendingQueue().catch(() => {});
      })();

      return () => ac.abort();
   }, [instrumentCode, tick]);

   return { data, loading, error, reload };
};

// Run on App start: reconcile queue & cache vs server, then refresh cache snapshot
export const useCalibBootstrap = () => {
   const [online, setOnline] = useState<boolean | null>(null);
   const [busy, setBusy] = useState(false);

   useEffect(() => {
      let cancelled = false;
      (async () => {
         setBusy(true);
         const isOnline = await checkOnline();
         if (!cancelled) setOnline(isOnline);

         if (isOnline) {
            await flushPendingQueue().catch(() => {});
            await ensureCacheServerSync().catch(() => {});
            await refreshCacheFromServer().catch(() => {});
         }
         if (!cancelled) setBusy(false);
      })();
      return () => { cancelled = true; };
   }, []);

   return { online, busy };
};
import type { SimpleCalibration, ListParams, InstrumentRow } from "@/types/calTypes";
import {
   listSimpleCalibrations as listOnline,
   getLatestCalibrationForInstrument as getLatestOnline,
   upsertSimpleCalibration as upsertOnline,
   pingHealth,
   listLatestPerInstrument
} from "@/services/api/toolData/toolApi";
import {
   getCachedLatest,
   putCachedLatest,
   replaceCachedLatest,
   enqueuePendingUnique,
   loadQueue,
   saveQueue,
   listCachedInstruments
} from "@/services/api/toolData/calCache";


// --- connectivity ---
export const checkOnline = async () => pingHealth(); 

// --- helpers ---
const ts = (d?: { validatedAt?: string; verifiedAt?: string }) => d?.validatedAt ?? d?.verifiedAt ?? "";


// --- list offline ---
export const listCalibrationsOffline = async (params?: { instrumentCode?: string }) => {
   if (params?.instrumentCode) {
      const one = await getCachedLatest(params.instrumentCode);
      return one ? [one] : [];
   }
   return [];
};


// --- list online, else cache ---
export const listCalibrationsSmart = async (params: ListParams = {}) => {
   const online = await checkOnline();
   if (online) {
      const rows = await listOnline(params);
      // cache refresh
      if (params.instrumentCode && rows?.[0]) await putCachedLatest(rows[0]);
      return rows;
   }
   return await listCalibrationsOffline({ instrumentCode: params.instrumentCode });
};

// ---- Latest calibration (online→cache fallback) ----
export const getLatestCalibration = async (instrumentCode: string): Promise<SimpleCalibration | null> => {
   if (await checkOnline()) {
      const doc = await getLatestOnline(instrumentCode);
      if (doc) await replaceCachedLatest(doc);
      return doc ?? (await getCachedLatest(instrumentCode));
   }
   return await getCachedLatest(instrumentCode);
};

// ---- Upsert (try server; else queue+cache) ----
export const upsertCalibration = async (doc: SimpleCalibration) => {
   if (await checkOnline()) {
      const saved = await upsertOnline(doc);
      await replaceCachedLatest(saved as SimpleCalibration);
      return { ok: true, offlineQueued: false, saved };
   }
   await enqueuePendingUnique(doc);
   await putCachedLatest(doc);
   return { ok: false, offlineQueued: true };
};


export const flushPendingQueue = async () => {
   const online = await checkOnline();
   if (!online) return { flushed: 0, remaining: (await loadQueue()).length };

   const q = await loadQueue();
   const keep: SimpleCalibration[] = [];
   let flushed = 0;

   for (const doc of q) {
      try {
         const saved = await upsertOnline(doc);
         await replaceCachedLatest(saved as SimpleCalibration);
         flushed++;
      } catch { keep.push(doc); }
   }
   await saveQueue(keep);
   return { flushed, remaining: keep.length };
};


// ---- Ensure local cache has newest server doc (if online) ----
export const ensureLatestCached = async (instrumentCode: string) => {
   const online = await checkOnline();
   if (!online) return;
   try {
      const server = await getLatestOnline(instrumentCode);
      if (server) await replaceCachedLatest(server);
   } catch { /* offline */ }
};


// Public: reconcile server <-> cache for all cached instruments (startup)
export const ensureCacheServerSync = async () => {
   const online = await checkOnline();
   if (!online) return { online: false, synced: 0, replacedLocal: 0 };

   const cachedMeta = await listCachedInstruments();
   let synced = 0;
   let replacedLocal = 0;

   for (const meta  of cachedMeta) {
      const code = meta?.code;
      if (!code) continue;

      let server: SimpleCalibration | null = null;
      try {
         server = await getLatestOnline(code);
      } catch { /*ignore*/ }

      const localTs = meta?.validatedAt ?? meta?.verifiedAt;
      const serverTs = server?.validatedAt ?? server?.verifiedAt;
      // local newer => push upstream
      if (!server || (localTs && (!serverTs || localTs > serverTs))) {
         const localFull = await getCachedLatest(code);
         if (localFull) {
            try {
               const saved = await upsertOnline(localFull);
               await replaceCachedLatest(saved as SimpleCalibration);
               synced++;
               continue;
            } catch { /*can’t push; keep local */}
         }
      }

      // server newer => replace local
      if (server && (!localTs || (serverTs && serverTs > localTs))) {
         await replaceCachedLatest(server);
         replacedLocal++;
      }
   }
   return { online: true, synced, replacedLocal };
};

// Public: pull latest set from server and refresh cache (startup)
export const refreshCacheFromServer = async () => {
   const online = await checkOnline();
   if (!online) return { online: false, updated: 0 };

   const latest = await listLatestPerInstrument();
   let updated = 0;
   for (const doc of Object.values(latest)) {
      await replaceCachedLatest(doc);
      updated++;
   }
   return { online: true, updated };
};


// ---- Unified instrument selector (server ∪ cache) ----
export const listInstrumentsCombined = async (limit = 250): Promise<InstrumentRow[]> => {
   const online = await checkOnline();
   const cached = await listCachedInstruments();

   //if (!online) return cached.map(x => ({ ...x, source: "cache" as const}));
   if (!online) {
      return cached
         .map<InstrumentRow>((x) => ({
            instrument: { code: x.code, name: x.name },
            validatedAt: x.validatedAt,
            verifiedAt: x.verifiedAt,
            source: "cache",
         }))
         .sort((a, b) => ts(b).localeCompare(ts(a)));
   }

   // fetch a page of server docs and fold into latest-by-code
   const serverRows = await listOnline({ limit });
   const latestByCode = new Map<string, SimpleCalibration>();

   for (const d of serverRows) {
      const code = (d.instrument?.code ?? "").trim();
      if (!code) continue;
      
      const prev = latestByCode.get(code);
      if (!prev || ts(d) > ts(prev)) latestByCode.set(code, d);

      /*
      const prevTs = prev?.validatedAt ?? prev?.verifiedAt ?? "";
      const nextTs = d.validatedAt ?? d.verifiedAt ?? "";
      if (!prev || (nextTs && nextTs > prevTs)) latestByCode.set(code, d);
      */
      // also feed cache so offline is up to date
      await putCachedLatest(d);
   }

   //const serverList = Array.from(latestByCode.values()).map((d) => ({
      //code: d.instrument?.code ?? "",
      
   const serverList: InstrumentRow[] = Array.from(latestByCode.values()).map((d) => ({
      instrument: { 
         code: d.instrument.code, 
         name: d.instrument.name 
      },
      name: d.instrument?.name,
      validatedAt: d.validatedAt,
      verifiedAt: d.verifiedAt,
      source: "server",
   }));

   // union by code (prefer server item when present)
   const out = new Map<string, InstrumentRow>();
   for (const x of cached) {
      out.set(x.code, {
         instrument: { code: x.code, name: x.name },
         validatedAt: x.validatedAt,
         verifiedAt: x.verifiedAt,
         source: "cache",
      });
   }
   for (const s of serverList) out.set(s.instrument.code, s);

   return Array.from(out.values()).sort((a, b) => ts(b).localeCompare(ts(a)));
   /*
   const out = new Map<string, (typeof serverList)[number]>();
   for (const item of cached) out.set(item.code, { ...item, source: "cache"});
   for (const item of serverList) out.set(item.code, item);
   return Array.from(out.values()).sort((a, b) => (a.code > b.code ? 1 : -1));
   */
};
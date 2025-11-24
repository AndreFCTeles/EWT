import type { InstrumentRow, SimpleCalibration } from "@/types/toolCalTypes";
import { readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { nowIso } from "@/services/utils/generalUtils";

const CACHE_FILE = "cal_cache.json"; 
const QUEUE_FILE = "cal_pending.json";
const PREFS_FILE = "app_prefs.json";  


type CacheMap = Record<string, SimpleCalibration>;
type AppPrefs = { selectedInstrumentCode?: string | null };


const getStorePath = async (name: string) => {
   const base = await appDataDir();
   await mkdir(base).catch(() => {});
   return await join(base, name);
};

const loadJson = async <T>(name: string, fallback: T): Promise<T> => {
   const p = await getStorePath(name);
   if (!(await exists(p))) return fallback;
   try { return JSON.parse(await readTextFile(p)) as T; } 
   catch { return fallback; }
};

const saveJson = async (name: string, data: unknown) => {
   const p = await getStorePath(name);
   const tmp = p + ".tmp";
   const s = JSON.stringify(data, null, 2);
   await writeTextFile(tmp, s);
   await writeTextFile(p, s);
};


// ---------- utils ----------
const normalizeCode = (code?: string | null) => (code ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const toIso = (s?: string | null): string => {
   const v = (s ?? "").trim();
   if (!v) return "";
   // ISO already?
   if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v;
   // dd/mm/yyyy
   const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
   if (m) {
      const dd = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
   }
   // last resort: Date.parse (may be locale dependent)
   const ts = Date.parse(v);
   if (!Number.isNaN(ts)) return nowIso(new Date(ts));
   return "";
};

const pickTimestamp = (doc: SimpleCalibration): string => toIso(doc.validatedAt) || toIso(doc.verifiedAt) || "";

/** Ensure a doc is safe for cache: normalized code + source="cache". */
const asCached = (doc: SimpleCalibration): SimpleCalibration => {
   const code = normalizeCode(doc?.instrument?.code);
   return {
      ...doc,
      instrument: { 
         code, 
         name: doc.instrument?.name 
      },
      source: "cache",
   };
};

// ---- cache API ----
export const getCachedLatest = async (instrumentCode: string) => {
   const code = normalizeCode(instrumentCode);
   if (!code) return null;
   const map = await loadJson<CacheMap>(CACHE_FILE, {});
   const entry = map[code];
   return entry ? asCached(entry) : null;
};

export const listCachedDocs = async (): Promise<SimpleCalibration[]> => {
   const map = await loadJson<CacheMap>(CACHE_FILE, {});
   return Object.values(map).map(asCached);
};

export const listCachedInstruments = async (): Promise<
   Array<{
      code: string;
      name?: string;
      validatedAt?: string;
      verifiedAt?: string;
   }>
> => {
   const map = await loadJson<CacheMap>(CACHE_FILE, {});
   const rows = Object.values(map)
      .map(asCached)
      .map(d => ({
         code: d.instrument?.code,
         name: d.instrument?.name,
         validatedAt: d.validatedAt,
         verifiedAt: d.verifiedAt,
         sortKey: pickTimestamp(d),
      }))
      .filter(x => x.code);

   rows.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
   return rows.map(({ sortKey, ...rest }) => rest);
};

export const putCachedLatest = async (doc: SimpleCalibration) => {
   const safe = asCached(doc);
   const code = safe.instrument.code; 
   if (!code) return;

   const map = await loadJson<CacheMap>(CACHE_FILE, {});
   const prev = map[code];

   // same file hash? no-op
   if (prev?.fileHash && doc.fileHash && prev.fileHash === doc.fileHash) return; 

   const prevTs = prev ? pickTimestamp(prev) : "";
   const nextTs = pickTimestamp(safe);

   // no timestamp → treat as not newer (avoid replacing with unknown age)
   if (!nextTs && prev) return;

   // replace if newer OR no previous
   if (!prev || (nextTs && (!prevTs || nextTs > prevTs))) {
      map[code] = safe;
      await saveJson(CACHE_FILE, map);
   }
};


export const replaceCachedLatest = async (doc: SimpleCalibration) => {
   const safe = asCached(doc);
   const code = safe.instrument.code;
   if (!code) return;

   const map = await loadJson<CacheMap>(CACHE_FILE, {});
   map[code] = safe;
   await saveJson(CACHE_FILE, map);
};


// ---- queue API ----
export const loadQueue = async () => loadJson<SimpleCalibration[]>(QUEUE_FILE, []);
export const saveQueue = async (q: SimpleCalibration[]) => saveJson(QUEUE_FILE, q);

export const enqueuePending = async (doc: SimpleCalibration) => {
   const q = await loadJson<SimpleCalibration[]>(QUEUE_FILE, []);
   q.push(doc);
   await saveJson(QUEUE_FILE, q);
};

export const enqueuePendingUnique = async (doc: SimpleCalibration) => {
   const safe = asCached(doc);
   const code = safe.instrument.code;
   if (!code) return;

   const q = await loadJson<SimpleCalibration[]>(QUEUE_FILE, []);
   const existsSame =
      !!safe.fileHash 
      && q.some(d => normalizeCode(d.instrument?.code) === code && d.fileHash === safe.fileHash);

   if (!existsSame) {
      q.push(safe);
      await saveQueue(q);
   }
};


export const removeFromQueue = async (
   pred: (d: SimpleCalibration) => boolean
) => {
   const q = await loadJson<SimpleCalibration[]>(QUEUE_FILE, []);
   const idx = q.findIndex(pred);
   if (idx >= 0) {
      q.splice(idx, 1);
      await saveQueue(q);
   }
};


// ---------- persisted selection ----------
export const getSelectedInstrumentCode = async (): Promise<string | null> => {
   const prefs = await loadJson<AppPrefs>(PREFS_FILE, {});
   const code = normalizeCode(prefs.selectedInstrumentCode);
   return code || null;
};

export const setSelectedInstrumentCode = async (code: string | null) => {
   const prefs = await loadJson<AppPrefs>(PREFS_FILE, {});
   prefs.selectedInstrumentCode = code ? normalizeCode(code) : null;
   await saveJson(PREFS_FILE, prefs);
};


/** Convenience: return the selected cached calibration (or null). */
export const getSelectedCalibration = async (): Promise<InstrumentRow | null> => {
   const code = await getSelectedInstrumentCode();
   return code ? await getCachedLatest(code) : null;
};
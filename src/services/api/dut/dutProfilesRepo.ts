import { nowIso } from '@/services/utils/generalUtils';
import type { DutProfile, DutProfileKey } from '@/types/dutProfileTypes';
import type { ProductData } from '@/types/productTypes';
// import Perfis + Produtos API clients here



const LOCAL_KEY = 'ewt.dutProfiles.v1';

function buildKey(partial: {
   brand: string;
   prodName: string;
   series?: string;
   categoryMain?: string;
   categorySub?: string;
   categorySubSub?: string;
   format?: string;
}): DutProfileKey {
   const { 
      brand, 
      prodName, 
      series, 
      categoryMain, 
      categorySub, 
      categorySubSub, 
      format 
   } = partial;
   return [
      brand?.trim().toLowerCase(),
      prodName?.trim().toLowerCase(),
      series?.trim().toLowerCase() ?? '',
      categoryMain ?? '',
      categorySub ?? '',
      categorySubSub ?? '',
      format ?? '',
   ].join('::');
}

// ---- Local storage ----
function loadLocalProfiles(): DutProfile[] {
   try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as DutProfile[];
   } catch {
      return [];
   }
}

function saveLocalProfiles(profiles: DutProfile[]) {
   try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(profiles));
   } catch {
      // ignore
   }
}

// ---- Mapping Utilities (Perfis, Produtos -> DutProfile) ----
function mapToProfile(perfi: any /* Perfi doc type */): DutProfile {
   // You can refine this once you define the Perfi schema.
   // Assume _id, brand, prodName, series, category, supply, ocv, updatedDate.
   const cat = perfi.category ?? {};
   return {
      origin: 'profile',
      sourceId: perfi._id,
      brand: perfi.brand,
      prodName: perfi.prodName,
      series: perfi.series,
      categoryMain: cat.main,
      categorySub: cat.sub?.main,
      categorySubSub: cat.sub?.sub?.main,
      format: cat.sub?.format,
      supply: perfi.supply ?? undefined,
      ocv: perfi.ocv ?? null,
      updatedAt: perfi.updatedDate ?? perfi.createdDate ?? nowIso(),
   };
}

function inferSupplyFromTechnical(technical: { field: string; value?: string }[]) {
   const t = technical.find(t => t.field === 'Tensão de alimentação');
   if (!t) return null;
   if (t.value) {
      const m = t.value.match(/(\d)x(\d+)/); // 3x400
      if (!m) return null;
      return { 
         phases: Number(m[1]), 
         voltage: Number(m[2]), 
         freqHz: 50 
      };
   }
   return null;
}

function mapProductToProfile(p: ProductData): DutProfile {
   const cat = p.category ?? {};
   const supply = inferSupplyFromTechnical(p.technical ?? []);

   return {
      origin: 'product',
      sourceId: p._id ?? `${p.brand}::${p.prodName}::${p.series ?? ''}`,
      brand: p.brand,
      prodName: p.prodName,
      series: p.series,
      categoryMain: cat.main,
      categorySub: cat.sub?.main,
      categorySubSub: cat.sub?.sub?.main,
      format: cat.sub?.format,
      supply: supply ?? undefined,
      ocv: null,
      updatedAt: p.updatedDate ?? p.createdDate ?? undefined,
   };
}

// ---- API fetch stubs (replace with your real API calls) ----
async function fetchPerfisFromApi(): Promise<any[]> {
   // e.g. GET http://.../banca/perfis
   return [];
}

async function fetchProdutosFromApi(): Promise<ProductData[]> {
   // e.g. GET http://.../produtos
   return [];
}

// ---- Public API: load merged profiles + products ----
export async function loadDutProfiles(): Promise<DutProfile[]> {
   const local = loadLocalProfiles();
   const byKey = new Map<DutProfileKey, DutProfile>();

   // seed with local profiles
   for (const p of local) {
      const key = buildKey(p);
      byKey.set(key, p);
   }

   // merge remote Perfis
   try {
      const remotePerfis = await fetchPerfisFromApi();
      for (const perfi of remotePerfis) {
         const profile = mapToProfile(perfi);
         const key = buildKey(profile);
         const existing = byKey.get(key);
         if (!existing) {
            byKey.set(key, profile);
         } else {
            // keep most recent
            const eDate = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
            const nDate = profile.updatedAt ? Date.parse(profile.updatedAt) : 0;
            if (nDate > eDate) byKey.set(key, profile);
         }
      }
   } catch {
      // offline → keep local only
   }

   // now we have best-known profiles; persist them
   const currentProfiles = [...byKey.values()].filter(p => p.origin === 'profile');
   saveLocalProfiles(currentProfiles);

   // try to add catalog products that don't have profiles
   try {
      const produtos = await fetchProdutosFromApi();
      for (const prod of produtos) {
         const profile = mapProductToProfile(prod);
         const key = buildKey(profile);
         if (!byKey.has(key)) {
            byKey.set(key, profile);
         }
      }
   } catch {
      // offline → we just keep the profiles
   }

   // final result: profiles first, products after
   const all = [...byKey.values()];
   return all.sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === 'profile' ? -1 : 1;
      const ad = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bd = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bd - ad;
   });
}

// ---- Persist profile when operation succeeds ----
export async function saveDutProfile(perfi: DutProfile) {
   // update local
   const local = loadLocalProfiles();
   const key = buildKey(perfi);
   const map = new Map(local.map(p => [buildKey(p), p]));
   const updated = { ...perfi, origin: 'profile', updatedAt: nowIso() };
   map.set(key, updated);
   const merged = [...map.values()];
   saveLocalProfiles(merged);

   // push to API (best effort)
   try {
      await fetch('/api/banca/perfis', {
         method: perfi.sourceId ? 'PUT' : 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(perfi),
      });
   } catch {
      // could mark "pending sync" if needed
   }
}

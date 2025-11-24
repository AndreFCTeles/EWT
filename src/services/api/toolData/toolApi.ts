import type { 
   SimpleCalibration, 
   ListParams 
} from "@/types/toolCalTypes"; //, ExistsResponse

const API_BASE = import.meta.env.VITE_DB_HOST




export const pingHealth = async (): Promise<boolean> => {
   try {
      const r = await fetch(`${API_BASE}/health`, { method: "GET", cache: "no-store" });
      return r.ok;
   } catch { return false; }
};

export const listSimpleCalibrations = async (params: ListParams = {}) => {
   const qp = new URLSearchParams();
   if (params.instrumentCode) qp.set("instrumentCode", params.instrumentCode);
   if (params.verifiedAt) qp.set("verifiedAt", params.verifiedAt);
   qp.set("limit", String(params.limit ?? 20));

   const r = await fetch(`${API_BASE}/qa/calibrations?${qp.toString()}`, {
      method: "GET",
   });
   if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
   return (await r.json()) as SimpleCalibration[];
}

export const getSimpleCalibrationById = async (id: string) => {
   const r = await fetch(`${API_BASE}/qa/calibrations/${id}`);
   if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
   return (await r.json()) as SimpleCalibration;
};


export const getLatestCalibrationForInstrument = async (instrumentCode: string) => {
   const docs = await listSimpleCalibrations({ instrumentCode, limit: 1 });
   return docs[0] ?? null; // assuming sorted by verifiedAt desc 
}

export const upsertSimpleCalibration = async (doc: SimpleCalibration) => {
   const r = await fetch(`${API_BASE}/qa/calibrations/simple`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
   });
   if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
   return await r.json();
}


export const listLatestPerInstrument = async (): Promise<Record<string, SimpleCalibration>> => {
   const many = await listSimpleCalibrations({ limit: 500 }); // bump if needed
   const byCode: Record<string, SimpleCalibration> = {};
   for (const d of many) {
      const code = d?.instrument?.code;
      if (!code) continue;
      const prev = byCode[code];
      const prevTs = prev?.validatedAt ?? prev?.verifiedAt;
      const nextTs = d.validatedAt ?? d.verifiedAt;
      if (!prev || (nextTs && (!prevTs || nextTs > prevTs))) byCode[code] = d;
   }
   return byCode;
};
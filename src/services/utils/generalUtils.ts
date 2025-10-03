import dayjs from "@/lib/dayjs-setup";



export const nowIso = () => dayjs().toISOString();

export const delay = (ms: number) => { return new Promise(r => setTimeout(r, ms)); }
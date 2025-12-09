import dayjs from "@/lib/dayjs-setup";


export const delay = (ms: number) => { return new Promise(r => setTimeout(r, ms)); }
export const nowIso = (d?: Date | number | string) => dayjs(d).toISOString();



export function excelSerialToDayjs(
   value: number | string | undefined
) {
   const serial = Number(value);
   const dateFormat = dayjs.utc("1899-12-30");
   return dateFormat.add(serial, "day");
}
export function serialToIsoDate(value: number | string | undefined) {
   const d = excelSerialToDayjs(value);
   return d.isValid() ? d.toISOString() : null;
}
export function serialToFormatDate(value: number | string | undefined) {
   const d = excelSerialToDayjs(value);
   return d.isValid() ? d.format("DD-MM-YYYY") : null;
}

export const roundTo5 = (value: number): number => Math.round(value / 5) * 5;
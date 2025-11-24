import { Process } from "@/types/checklistTypes";
import { SetpointConfig } from "@/types/dutCalTypes";






export function generateEquidistantSetpoints(min: number, max: number): number[] {
   if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error("Setpoints must be finite numbers");
   }
   if (max <= min) {
      throw new Error("Max setpoint must be greater than min setpoint");
   }

   const step = (max - min) / 3;
   return [
      Math.round(min),
      Math.round(min + step),
      Math.round(min + 2 * step),
      Math.round(max),
   ];
}

// Given process (MMA/TIG/MIG), bank type, and desired current,
// return best N options sorted by errorPercent.
export function resolveLoadBankSetpoint(
   process: Process,
   bankType: "PRODUCTION" | "LAB" | "1000A",
   targetCurrent: number
): SetpointConfig {
   // TODO: use parsed "Load Bank - XXX" sheets + Banca Resistências 1000A.xlsx
   // For now: stub with a single "fake" mask.
   return {
      id: 0,
      currentA: targetCurrent,
      options: [
         {
         mask: 0b0000_0000_0000_1111,
         label: "Example R1+R2+R3+R4",
         errorPercent: 1.2,
         },
      ],
   };
}

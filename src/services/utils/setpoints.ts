import { Process } from "@/types/checklistTypes";
import { SetpointConfig } from "@/types/commTypes";



/**
 * Generate N equidistant setpoints between min and max, including both ends.
 * Currently we always use count=4, but this is easy to change later.
 */
export function generateEquidistantSetpoints(min: number, max: number, count: number): number[] {
   if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error("Setpoints must be finite numbers");
   }
   if (max <= min) {
      throw new Error("Max setpoint must be greater than min setpoint");
   }
   if (count < 2) {
      return [Math.round(min)];
   }
   const step = (max - min) / (count - 1);
   const points = Array.from({ length: count }, (_, i) => Math.round(min + i * step));
   console.log("[LB/SETPOINTS] Equidistant", { min, max, count, points });
   return points;
}

/**
 * Process-specific rules:
 * - MMA / TIG / MIGInv: manual min & max (from dut.ratedCurrent), 2 equidistant internal points.
 * - MIGConv: only max is manual; we use 25%, 50%, 75%, 100% of max.
 */
export function generateSetpointsForProcess(
   process: Process,
   minCurrent: number | undefined,
   maxCurrent: number,
   count?: number
): number[] {
   if (!count) count = 4;
   if (process === "MIGConv") {
      const percents = [0.25, 0.5, 0.75, 1];
      const points = percents.map((p) => Math.round(maxCurrent * p));
      console.log("[LB/SETPOINTS] MIGConv fixed percents", { maxCurrent, points });
      return points;
   }
   const min = minCurrent ?? Math.round(maxCurrent * 0.25);
   return generateEquidistantSetpoints(min, maxCurrent, count);
}




/**
 * Placeholder implementation: for now, we don't compute real contactor combinations.
 * Each setpoint just gets a dummy option; later we'll plug in the IEC + bank data.
 * Given process (MMA/TIG/MIG), bank type, and desired current, return best N options sorted by errorPercent.
 */
export function resolveLoadBankSetpoint(
   id: number,
   process: Process,
   bankType: "PRODUCTION" | "LAB" | "1000A",
   targetCurrent: number
): SetpointConfig {
   // TODO: use parsed "Load Bank - XXX" sheets + Banca Resistências 1000A.xlsx
   // For now: stub with a single "fake" mask.
   return {
      id,
      currentA: targetCurrent,
      options: [
         {
            mask: 0b0000_0000_0000_1111,
            label: "Dummy combo R1+R2+R3+R4 (TBD)",
            errorPercent: 1.2,
         },
      ],
   };
}

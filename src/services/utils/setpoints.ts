import { DEV_ECHO_COUNT, DEV_ECHO_REL_ERROR } from "@/dev/devConfig";
import type { Process } from "@/types/checklistTypes";
import type { LoadBankBranch, ContactorOption, SetpointConfig, ComboCandidate } from "@/types/commTypes";
import { LB_BRANCHES } from "@/types/commTypes";







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
   if (!count) count = DEV_ECHO_COUNT;
   if (process === "MIGConv") {
      //const percents = [0.25, 0.5, 0.75, 1];
      const percents = count===5 ? 
         [0.2, 0.4, 0.6, 0.8, 1] : 
         [0.25, 0.5, 0.75, 1];
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
   bankType: string,//"PRODUCTION" | "LAB" | "1000A",
   targetCurrent: number,
   maxRelError = DEV_ECHO_REL_ERROR
): SetpointConfig {
   // TODO: use parsed "Load Bank - XXX" sheets + Banca Resistências 1000A.xlsx
   // For now: stub with a single "fake" mask.

   console.log("[LB/SETPOINTS] resolveLoadBankSetpoint props: ", { id, process, bankType, targetCurrent });
   const combo = findBestComboForCurrent(process, targetCurrent, maxRelError);

   const options: ContactorOption[] = combo ? [
      {
         mask: combo.mask,
         label: formatComboLabel(combo),
         errorPercent: combo.relErrorCurrent * 100,
      },
   ] : [];

   return {
      id,
      currentA: targetCurrent,
      options,
   };
   /*
   return {
      id,
      currentA: targetCurrent,
      options: [
         {
            mask: 0b0000_0000_0000_1111,
            label: "",//"Dummy combo R1+R2+R3+R4 (TBD)",
            errorPercent: 1.2,
         },
      ],
   };
   */
}




function calcU2(process: Process, currentA: number): number {
   if (currentA <= 0) return NaN;

   switch (process) {
      case "MMA":
         return 0.04 * currentA + 20;
      case "TIG":
         return 0.04 * currentA + 10;
      case "MIGConv":
      case "MIGInv":
         return 0.05 * currentA + 14;
      default:
         return NaN;
   }
}
function findBestComboForCurrent(
   process: Process,
   targetCurrentA: number,
   maxRelError = 0.06  // 6% tolerance to start with
): ComboCandidate | null {
   if (targetCurrentA <= 0) return null;

   const U2 = calcU2(process, targetCurrentA);
   if (!Number.isFinite(U2) || U2 <= 0) return null;

   const n = LB_BRANCHES.length;
   let best: ComboCandidate | null = null;

   // iterate masks 1..(2^n - 1)
   for (let maskIndex = 1; maskIndex < (1 << n); maskIndex++) {
      const used: LoadBankBranch[] = [];
      let invSum = 0; // sum of 1/R

      for (let i = 0; i < n; i++) {
         if (maskIndex & (1 << i)) {
            const b = LB_BRANCHES[i];
            used.push(b);
            invSum += 1 / b.ohm;
         }
      }

      if (invSum === 0) continue;
      const reqOhm = 1 / invSum;

      // current delivered for this combo at U2
      const approxCurrentA = U2 / reqOhm;
      const relErrorCurrent = Math.abs(approxCurrentA - targetCurrentA) / targetCurrentA;

      if (relErrorCurrent > maxRelError) continue; // too far from target

      // thermal check: each branch must be ≤ maxKw
      let unsafe = false;
      for (const b of used) {
         // P = U^2 / R (W) -> /1000 to kW
         const pKw = (U2 * U2) / b.ohm / 1000;
         if (pKw > b.maxKw + 1e-9) {
            unsafe = true;
            break;
         }
      }
      if (unsafe) continue;

      // Build contactor mask (OR the maskBits of used branches)
      let mask = 0;
      for (const b of used) {
         mask |= b.maskBit;
      }

      // Select best: smallest error, then fewer branches
      if (
         !best ||
         relErrorCurrent < best.relErrorCurrent ||
         (Math.abs(relErrorCurrent - best.relErrorCurrent) < 1e-9 &&
         used.length < best.branches.length)
      ) {
         best = {
         mask,
         branches: used,
         reqOhm,
         approxCurrentA,
         relErrorCurrent,
         };
      }
   }

   return best;
}

function formatComboLabel(combo: ComboCandidate): string {
   const ids = combo.branches.map((b) => b.id).sort();
   const approx = combo.approxCurrentA.toFixed(0);
   return `${ids.join(" + ")} (≈${approx} A)`;
}
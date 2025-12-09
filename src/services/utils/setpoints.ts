import { DEV_ECHO_COUNT, DEV_ECHO_REL_ERROR } from "@/dev/devConfig";
import type { Process } from "@/types/checklistTypes";
import type { LoadBankBranch, ContactorOption, SetpointConfig, ComboCandidate } from "@/types/commTypes";
import { LB_BRANCHES } from "@/types/commTypes";
import { roundTo5 } from "./generalUtils";







/**
 * Generate N equidistant setpoints between min and max, including both ends.
 */
/*
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
   */

/**
 * Process-specific rules:
 * - MMA / TIG / MIGInv: manual min & max (from dut.ratedCurrent), 2 equidistant internal points.
 * - MIGConv: only max is manual; we use 25%, 50%, 75%, 100% of max.
 */
/*
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
   */

export function generateSetpointsForProcess(
   process: Process,
   minCurrent: number | undefined,
   maxCurrent: number,
   count = DEV_ECHO_COUNT
): number[] {
   if (!maxCurrent || maxCurrent <= 0 || count <= 0) return [];
   console.log("---------------------- GENERATING SETPOINTS ----------------------");
   console.log("maxCurrent:", maxCurrent);

   // MIGConv: ignore min, use 25/50/75/100% of max
   if (process === "MIGConv") {
      console.log("Process: ", process)
      const fractions = [0.25, 0.5, 0.75, 1.0].slice(0, count);
      console.log("fractions: ", fractions)
      //const raw = fractions.map((f) => maxCurrent * f);
      const raw = fractions.map((f) => Math.max(5, maxCurrent * f));
      console.log("raw: ", raw)
      const rounded = raw.map(roundTo5);
      console.log("rounded setpoints: ", rounded)
      // ensure sorted and unique
      //return Array.from(new Set(rounded)).sort((a, b) => a - b);

      let uniq = Array.from(new Set(rounded)).sort((a, b) => a - b);
      console.log("Unique setpoints: ", uniq)
      const roundedMax = roundTo5(maxCurrent);
      if (!uniq.includes(roundedMax)) { uniq.push(roundedMax); }

      if (uniq.length > count) { uniq = uniq.slice(uniq.length - count); }
      console.log("after rounding uniq: ", uniq)

      return uniq;
   }
   
   console.log("Process: ", process)
   console.log("minCurrent:", minCurrent);


   // Default min: 5% of max, at least 5 A
   const fallbackMin = Math.max(5, maxCurrent * 0.05);

   // For MMA / TIG / MIGInv: use min + max
   const minForUse =
      typeof minCurrent === "number" &&
      Number.isFinite(minCurrent) &&
      minCurrent >= 5 &&
      minCurrent < maxCurrent
         ? minCurrent
         : fallbackMin; 
   console.log("minForUse:", minForUse);

   if (count === 1) { return [roundTo5(maxCurrent)]; }

   const step = (maxCurrent - minForUse) / (count - 1);
   const currents: number[] = [];

   
   console.log("raw calculated setpoints:");
   for (let i = 0; i < count; i++) {
      const raw = minForUse + i * step;
      console.log(raw);
      currents.push(roundTo5(raw));
   }
   console.log("rounded calculated setpoints:", currents);

   // Ensure monotonic and within [0, maxCurrent] after rounding
   let uniq = Array.from(new Set(currents)).sort((a, b) => a - b);
   console.log("Unique setpoints: ", uniq)

   // Guarantee the last point is exactly rounded maxCurrent
   const roundedMax = roundTo5(maxCurrent);
   if (!uniq.includes(roundedMax)) {
      if (uniq.length >= count) {
         uniq[uniq.length - 1] = roundedMax;
      } else {
         uniq.push(roundedMax);
      }
   }

   // Limit to desired count (keeping the highest ones if we had duplicates)
   if (uniq.length > count) {
      uniq = uniq.slice(uniq.length - count);
   }
   console.log("Unique setpoints after normalization/guards: ", uniq)
   console.log("---------------------- ----------------------");

   return uniq;
}




/**
 * Given process (MMA/TIG/MIG), bank type, and desired current, return best N options sorted by errorPercent.
 */
   /*
export function resolveLoadBankSetpoint(
   id: number,
   process: Process,
   bankType: 0,//string,//"PRODUCTION" | "LAB" | "1000A", // "LAB" = 0
   targetCurrent: number,
   maxRelError = DEV_ECHO_REL_ERROR
): SetpointConfig {

   console.log("[LB/SETPOINTS] resolveLoadBankSetpoint props: ", { id, process, bankType, targetCurrent });
   const combo = findBestComboForCurrent(process, targetCurrent, maxRelError);

   const options: ContactorOption[] = combo ? [
      {
         mask: combo.mask,
         label: formatComboLabel(combo),
         errorPercent: combo.relErrCurrent * 100,
      },
   ] : [];

   return {
      id,
      currentA: targetCurrent,
      options,
   };
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
}
   */
export function resolveLoadBankSetpoint(
   id: number,
   process: Process,
   bankType: 0,//string,//"PRODUCTION" | "LAB" | "1000A", // "LAB" = 0
   currentA: number,
   maxRelError = 0.15
): SetpointConfig {
   const combo = findBestComboForCurrent(process, currentA, maxRelError);

   /*
   if (!combo) {
      console.warn(
         "[setpoints] no valid resistor combo",
         { id, process, currentA, bankType }
      );
   } else {
      console.debug(
         "[setpoints] combo chosen",
         {
            id,
            process,
            currentA,
            approxCurrentA: combo.approxCurrentA,
            relErrCurrent: combo.relErrCurrent,
            branches: combo.branches.map((b) => b.id),
            mask: `0x${combo.mask.toString(16)}`,
         }
      );
   }
   */
   if (!combo) {
      console.warn("[setpoints] no valid resistor combo", {
         id,
         process,
         bankType,
         currentA,
      });

      return {
         id,
         currentA: currentA,
         options: [], // "impossível" case – matches your sheet
      };
   }

   /*
   const options: ContactorOption[] = combo
      ? [
         {
            mask: combo.mask,
            label: combo.branches
               .map((b) => b.id)
               .sort()
               .join(" + "),
            errorPercent: combo.relErrCurrent * 100,
         },
      ] : [];
   */
   const { branches, mask, approxCurrentA, relErrCurrent } = combo;

   const R_target = calcU2(process, currentA) / currentA;
   const relErrPercentR = relErrCurrent * 100;

   // You can change this label format if you prefer something else
   const label =
      branches
         .map((b) => b.id)
         .sort()
         .join(" + ") +
      ` (Req≈${combo.reqOhm.toFixed(4)}Ω, Rerr=${relErrPercentR.toFixed(1)}%)`;

   const options: ContactorOption[] = [
      {
         mask,
         label,
         // store signed % so you can see "negative" vs "positive" error
         errorPercent: relErrPercentR,
      },
   ];
   
   /*
   console.log("resolveLoadBankSetPoint results");
   console.log({
      id,
      currentA: currentA,
      options,
   });
   return {
      id,
      currentA: currentA,
      options,
   };
   */
   
   console.debug("[setpoints] combo chosen", {
      id,
      process,
      currentA,
      approxCurrentA,
      R_target,
      R_req: combo.reqOhm,
      relErrPercentR,
      branches: branches.map((b) => b.id),
      maskHex: "0x" + mask.toString(16),
   });

   return {
      id,
      currentA: currentA,
      options,
   };
}




/*
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
*/

function calcU2(process: Process, I2: number): number {
   
   console.log("calculating U2 for I2: ", I2)
   const I = Math.max(5, I2);
   console.log("normalized I2: ", I)

   // normV: minProcessV ≤ U2 ≤ maxProcessV
   // normA: minProcessA ≤ I2 ≤ minProcessA

   let u2: number;
   switch (process) {
      case "MMA":{
         u2 = 0.04 * I + 20;
         if (u2 < 20) u2 = 20;
         if (u2 > 44) u2 = 44;
         break;
      }
      case "TIG":{
         u2 = 0.04 * I + 10;
         if (u2 < 10) u2 = 10;
         if (u2 > 34) u2 = 34;
         break;
      }
      case "MIGConv":
      case "MIGInv": {
         // MIG type behaviour per IEC, both conv / inv
         u2 = 0.05 * I + 14;
         if (u2 < 14) u2 = 14;
         if (u2 > 44) u2 = 44;
         break;
      }
      default:{
         // Fallback to MMA if ever needed
         u2 = 0.04 * I + 20;
         if (u2 < 20) u2 = 20;
         if (u2 > 44) u2 = 44;
         break;
      }
   }
   
   console.log("calcU2 result: ", u2)
   return u2;
}




function findBestComboForCurrent(
   process: Process,
   targetCurrentA: number,
   maxRelError = DEV_ECHO_REL_ERROR // 6% to start
): ComboCandidate | null {
   if (!targetCurrentA || targetCurrentA <= 0) return null;

   const U2 = calcU2(process, targetCurrentA);
   if (!Number.isFinite(U2) || U2 <= 0) return null;

   const R_target = U2 / targetCurrentA;
   const n = LB_BRANCHES.length;
   const candidates: ComboCandidate[] = [];

   for (let maskIndex = 1; maskIndex < (1 << n); maskIndex++) {
      const used: LoadBankBranch[] = [];
      let invSum = 0;

      for (let i = 0; i < n; i++) {
         if (maskIndex & (1 << i)) {
            const b = LB_BRANCHES[i];
            used.push(b);
            invSum += 1 / b.ohm;
         }
      }

      if (!used.length || invSum === 0) continue;

      const R_req = 1 / invSum;
      
      const relErrCurrent = (R_req - R_target) / R_target;
      const relErrAbs = Math.abs(relErrCurrent);
      if (relErrCurrent < -maxRelError || relErrCurrent > maxRelError) continue;
      if (relErrCurrent > 0) continue;

      /*
      const approxCurrentA = U2 / reqOhm;
      const relErrCurrent = (approxCurrentA - targetCurrentA) / targetCurrentA;
      const relErrAbs = Math.abs(relErrCurrent);

      if (relErrAbs > maxRelError) continue;
      */

      // Per-branch power check (kW)
      let unsafe = false;
      for (const b of used) {
         const pKw = (U2 * U2) / b.ohm / 1000;
         if (pKw > b.maxKw + 1e-9) {
            unsafe = true;
            break;
         }
      }
      if (unsafe) continue;

      

      const approxCurrentA = U2 / R_req;
      let mask = 0;
      for (const b of used) mask |= b.maskBit;

      candidates.push({
         mask,
         branches: used,
         reqOhm: R_req,
         approxCurrentA,
         relErrCurrent,
         relErrAbs,
      });
   }
   console.log("candidates:");
   console.log(candidates);

   if (!candidates.length) return null;

   // Prefer combos where I_actual >= I_target (relErrCurrent >= 0),
   // i.e. R_req <= R_target, exactly what you described.
   /*
   const preferred = candidates.filter((c) => c.relErrCurrent >= 0);

   const pool = preferred.length > 0 ? preferred : [];

   if (!pool.length) {
      // No combo that gives at least target current within tolerance
      return null; // "impossível"
   }*/

   // Pick smallest absolute error, tie-break by fewer branches
   let best: ComboCandidate | null = null;
   for (const c of candidates) {
      if (
         !best ||
         c.relErrAbs < best.relErrAbs ||
         (Math.abs(c.relErrAbs - best.relErrAbs) < 1e-9 &&
         c.branches.length < best.branches.length)
      ) { best = c; }
   }   



   console.log("best:");
   console.log(best);
   return best;
}



/*
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
      const relErrCurrent = (approxCurrentA - targetCurrentA) / targetCurrentA;
      const relErrorCurrent = Math.abs(relErrCurrent);
      //const relErrorCurrent = Math.abs(approxCurrentA - targetCurrentA) / targetCurrentA;

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
      for (const b of used) { mask |= b.maskBit; }

      // Select best: smallest error, then fewer branches
      if (
         !best ||
         relErrorCurrent < best.relErrCurrent ||
         (Math.abs(relErrorCurrent - best.relErrCurrent) < 1e-9 && used.length < best.branches.length)
      ) {
         best = {
            mask,
            branches: used,
            reqOhm,
            approxCurrentA,
            relErrCurrent,
         };
      }
   }
   console.log(best);

   return best;
}

function formatComboLabel(combo: ComboCandidate): string {
   const ids = combo.branches.map((b) => b.id).sort();
   const approx = combo.approxCurrentA.toFixed(0);
   return `${ids.join(" + ")} (≈${approx} A)`;
}
*/
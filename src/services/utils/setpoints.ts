import { DEV_ECHO_COUNT, DEV_ECHO_REL_ERROR } from "@/dev/devConfig";
import { LB_BRANCHES, RDP4000 } from "@/types/commTypes";
import { roundTo5 } from "./generalUtils";
import type { Process } from "@/types/checklistTypes";
import type { 
   LoadBankBranch, 
   ContactorOption, 
   SetpointConfig, 
   ComboCandidate, 
   ResistorSpec
} from "@/types/commTypes";



/* ──────────────────────────────────────────────────────────────────────────────
   Debug
────────────────────────────────────────────────────────────────────────────── */

const DEBUG_SETPOINTS = true; // flip to false when stable
function dbg(...args: any[]) { if (DEBUG_SETPOINTS) console.log(...args); }


/* ──────────────────────────────────────────────────────────────────────────────
   Config
────────────────────────────────────────────────────────────────────────────── */

// expected “measurement on” time for a setpoint burn (used for overload feasibility)
const MEAS_PULSE_MS = 5000;

// tunnel cooling: 2 resistors per tunnel + fan; use as a balance target (not a hard limit)
const TUNNEL_CONT_KW = 8.0;

// Error preference:
// - Best is around -0.1% (slightly under target).
// - Treat near-zero as "positive-ish" to avoid choosing 0.0% over a small negative.
const TARGET_UNDER = -0.001; // -0.1%
const ZERO_AS_POS = 0.0005; // -0.05% and above counts as positive-ish
const POS_FINE_MAX = 0.001; // +0.1% is "nice positive"


/* ──────────────────────────────────────────────────────────────────────────────
   Level 1 duty-cycle budgeting (rolling window)
────────────────────────────────────────────────────────────────────────────── */

type Interval = { startMs: number; endMs: number };

export class DutyCycleBudget {
   readonly cycleMs: number;
   private currentMask = 0;
   private lastChangeMs = Date.now();
   private intervalsByBit = new Map<number, Interval[]>();
   constructor(spec: ResistorSpec) {
      const w = spec.overloadWindows?.[0];
      this.cycleMs = w?.cycleMs ?? 120_000;
   }
   /** Call whenever the *actual* contactorsMask changes (from polling or command response). */
   setMask(nextMask: number, atMs = Date.now()) {
      if (!Number.isFinite(atMs)) atMs = Date.now();
      if (nextMask === this.currentMask) return;
      const prevMask = this.currentMask;
      const from = this.lastChangeMs;
      const to = Math.max(atMs, from);
      // record interval for every branch that was ON
      for (const b of LB_BRANCHES) {
         if (prevMask & b.maskBit) {
            const arr = this.intervalsByBit.get(b.maskBit) ?? [];
            arr.push({ startMs: from, endMs: to });
            this.intervalsByBit.set(b.maskBit, arr);
         }
      }
      this.currentMask = nextMask;
      this.lastChangeMs = to;
      this.prune(to);
   }
   /** Rolling used time for a given maskBit within [now-cycleMs, now]. Includes current ON time. */
   usedOnMs(maskBit: number, nowMs = Date.now()): number {
      const windowStart = nowMs - this.cycleMs;
      const arr = this.intervalsByBit.get(maskBit) ?? [];
      let used = 0;
      for (const it of arr) {
         const a = Math.max(it.startMs, windowStart);
         const b = Math.min(it.endMs, nowMs);
         if (b > a) used += b - a;
      }
      // include current ON segment if this bit is currently on
      if (this.currentMask & maskBit) {
         const a = Math.max(this.lastChangeMs, windowStart);
         const b = nowMs;
         if (b > a) used += b - a;
      }
      return used;
   }
   /** Removes intervals that are completely outside the rolling window. */
   prune(nowMs = Date.now()) {
      const windowStart = nowMs - this.cycleMs;
      for (const [bit, arr] of this.intervalsByBit.entries()) {
         const kept = arr.filter((it) => it.endMs > windowStart);
         if (kept.length) this.intervalsByBit.set(bit, kept);
         else this.intervalsByBit.delete(bit);
      }
   }
   reset() {
      this.currentMask = 0;
      this.lastChangeMs = Date.now();
      this.intervalsByBit.clear();
   }
}

/** Singleton budget for this app run. */
export const lbDutyBudget = new DutyCycleBudget(RDP4000);

/** Convenience for wiring from polling/command replies. */
export function updateDutyCycleFromMask(mask: number, atMs?: number) {
   lbDutyBudget.setMask(mask, atMs);
}



/* ──────────────────────────────────────────────────────────────────────────────
   Public API: setpoint list
────────────────────────────────────────────────────────────────────────────── */

export function generateSetpointsForProcess(
   process: Process,
   minCurrent: number | undefined,
   maxCurrent: number,
   count = DEV_ECHO_COUNT
): number[] {
   if (!Number.isFinite(maxCurrent) || !maxCurrent || maxCurrent <= 0 || count <= 0) return [];
   dbg("---------------------- GENERATING SETPOINTS ----------------------");
   dbg("maxCurrent:", maxCurrent);

   // MIGConv: ignore min, use 25/50/75/100% of max
   if (process === "MIGConv") { /* ------------------------------------------------------ */ dbg("Process: ", process)
      const fractions = [0.25, 0.5, 0.75, 1.0].slice(0, count); /* ---------------------- */ dbg("fractions: ", fractions);
      const rounded = fractions.map((f) => roundTo5(Math.max(5, maxCurrent * f))); /* --- */ dbg("rounded setpoints: ", rounded);
      let uniq = Array.from(new Set(rounded)).sort((a, b) => a - b); /* ----------------- */ dbg("Unique setpoints: ", uniq);

      const roundedMax = roundTo5(maxCurrent);
      if (!uniq.includes(roundedMax)) uniq.push(roundedMax);
      if (uniq.length > count) { uniq = uniq.slice(uniq.length - count); } 

      dbg("[setpoints] generated MIGConv setpoints:", uniq);
      return uniq;
   }
   
   dbg("Process: ", process)
   dbg("minCurrent:", minCurrent);

   // Default min: 5% of max, at least 5 A
   const fallbackMin = Math.max(5, maxCurrent * 0.05);

   // For MMA / TIG / MIGInv: use min + max
   const minForUse =
      typeof minCurrent === "number" &&
      Number.isFinite(minCurrent) &&
      minCurrent >= 5 &&
      minCurrent < maxCurrent
         ? minCurrent
         : fallbackMin; /* -------------------------------------------------------------- */ dbg("minForUse:", minForUse);

   if (count === 1) { return [roundTo5(maxCurrent)]; }

   const step = (maxCurrent - minForUse) / (count - 1);
   const points = Array.from({ length: count }, (_, i) => roundTo5(minForUse + i * step));   dbg("calculated setpoints:", points);

   // Ensure monotonic and within [0, maxCurrent] after rounding
   let uniq = Array.from(new Set(points)).sort((a, b) => a - b); /* --------------------- */ dbg("Unique setpoints: ", uniq);

   // Guarantee the last point is exactly rounded maxCurrent
   const roundedMax = roundTo5(maxCurrent);
   if (!uniq.includes(roundedMax)) {
      if (uniq.length >= count) uniq[uniq.length - 1] = roundedMax;
      else uniq.push(roundedMax);
   }

   // Limit to desired count (keeping the highest ones if we had duplicates)
   if (uniq.length > count) uniq = uniq.slice(uniq.length - count);
   dbg("[setpoints] generated setpoints:", { process, minForUse, maxCurrent, count, uniq });
   dbg("---------------------- ----------------------");

   return uniq;
}





/* ──────────────────────────────────────────────────────────────────────────────
   Public API: resolve setpoint into a single best combo option
────────────────────────────────────────────────────────────────────────────── */

export function resolveLoadBankSetpoint(
   id: number,
   process: Process,
   bankType: 0, //string, //"PRODUCTION" | "LAB" | "1000A", // "LAB" = 0
   currentA: number,
   maxRelError = 0.15
): SetpointConfig {
   const combo = findBestComboForCurrent(process, currentA, maxRelError);

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
         options: [],
      };
   }

   const comboLabel = combo.branches
      .map((b) => b.id)
      .slice()
      .sort()
      .join(" + ");
   const comboDisplay = combo.branches
      .map((b) => b.id)
      .slice()
      .sort();


   // Prefer showing BOTH:
   // - Rerr% (sheet-consistent, and what we rank on)
   // - Ierr% (informational, derived)
   const rErrPct = combo.errR * 100;
   const iErrPct = combo.errI * 100;

   const maxOn =
      combo.maxOnMs == null
         ? "impossível"
         : combo.maxOnMs === Infinity
         ? "contínuo"
         : `${Math.round(combo.maxOnMs / 1000)}s`;

   const errorLabel = [
      `I ≈ ${combo.approxCurrentA.toFixed(0)}A`,
      `Ierr = ${iErrPct.toFixed(1)}%`,
      `Req ≈ ${combo.reqOhm.toFixed(4)}Ω`,
      `Rerr = ${rErrPct.toFixed(1)}%`,
      `tOn = ${maxOn}`,
      `usedMax = ${Math.round(combo.usedOnMsMax / 1000)}s/${Math.round(combo.cycleMs / 1000)}s`,
      `${combo.u2V} V`,
   ];//.join(" · ");

   const options: ContactorOption[] = [
      {
         mask: combo.mask,//mask,
         comboDisplay,
         comboLabel,
         errorLabel,
         errorPercent: rErrPct,//relErrPercentR,
      },
   ];


   dbg("[setpoints] chosen combo:", {
      id,
      process,
      currentA,
      u2V: combo.u2V,
      approxCurrentA: combo.approxCurrentA,
      errR: combo.errR,
      errI: combo.errI,
      branches: combo.branches.map((b) => b.id),
      maskHex: "0x" + combo.mask.toString(16),
      maxOnMs: combo.maxOnMs,
      maxBranchFactor: combo.maxBranchFactor,
      maxTunnelKw: combo.maxTunnelKw,
      outOfTolerance: combo.outOfTolerance,
   });


   return {
      id,
      currentA: currentA,
      options,
   };
}



/* ──────────────────────────────────────────────────────────────────────────────
   IEC U2 models
────────────────────────────────────────────────────────────────────────────── */

function calcU2(process: Process, I2: number): number {
   const I = Math.max(5, I2);
   switch (process) {
      case "MMA": {
         const u = 0.04 * I + 20;
         return clamp(u, 20, 44);
      }
      case "TIG": {
         const u = 0.04 * I + 10;
         return clamp(u, 10, 34);
      }
      case "MIGConv":
      case "MIGInv": {
         const u = 0.05 * I + 14;
         return clamp(u, 14, 44);
      }
      default: {
         const u = 0.04 * I + 20;
         return clamp(u, 20, 44);
      }
   }
}

function clamp(x: number, lo: number, hi: number) {
   return Math.min(hi, Math.max(lo, x));
}



/* ──────────────────────────────────────────────────────────────────────────────
   Thermal feasibility helpers
────────────────────────────────────────────────────────────────────────────── */

function maxAllowedOnMsForBranch(pKw: number, spec: ResistorSpec): number | null {
   const factor = (pKw * 1000) / spec.P_R;
   if (factor <= 1) return Infinity;

   let best = -1;
   for (const w of spec.overloadWindows) {
      if (factor <= w.factorMax) best = Math.max(best, w.tOnMaxMs);
   }
   return best >= 0 ? best : null;
}

function isComboFeasibleForPulse(
   branches: LoadBankBranch[],
   u2V: number,
   spec: ResistorSpec,
   //tOnMs: number
   pulseMs: number,
   budget: DutyCycleBudget,
   nowMs: number
): { 
   ok: boolean; 
   maxOnMs: number | null; 
   maxBranchKw: number; 
   maxBranchFactor: number; 
   maxTunnelKw: number;
   usedOnMsMax: number;
   remainingOnMsMin: number | null;
} {
   let maxOnMs: number | null = Infinity;
   let usedOnMsMax = 0;
   let remainingOnMsMin: number | null = Infinity;

   let maxBranchKw = 0;
   let maxBranchFactor = 0;
   const tunnelKw: number[] = [0, 0, 0, 0];

   for (const b of branches) {
      const pKw = (u2V * u2V) / b.ohm / 1000;
      maxBranchKw = Math.max(maxBranchKw, pKw);

      const factor = (pKw * 1000) / spec.P_R;
      maxBranchFactor = Math.max(maxBranchFactor, factor);

      tunnelKw[b.tunnel] += pKw;

      const allowed = maxAllowedOnMsForBranch(pKw, spec);
      if (allowed == null) {
         return {
            ok: false,
            maxOnMs: null,
            maxBranchKw,
            maxBranchFactor,
            maxTunnelKw: Math.max(...tunnelKw),
            usedOnMsMax,
            remainingOnMsMin: null,
         };
      }

      const used = budget.usedOnMs(b.maskBit, nowMs);
      usedOnMsMax = Math.max(usedOnMsMax, used);

      // budget remaining in the rolling cycle window
      const remaining =
         allowed === Infinity ? Infinity : Math.max(0, allowed - used);

      // for UI/debug: min remaining across branches
      if (remainingOnMsMin === Infinity) remainingOnMsMin = remaining;
      else if (remainingOnMsMin != null) remainingOnMsMin = Math.min(remainingOnMsMin, remaining);

      // “maxOnMs” for the combo becomes the minimum remaining among branches
      if (maxOnMs === Infinity) maxOnMs = remaining;
      else if (maxOnMs != null) maxOnMs = Math.min(maxOnMs, remaining);
   }


   const maxTunnelKw = Math.max(...tunnelKw);

   // Hard gate: must be able to run the planned pulse within remaining budget
   if (maxOnMs !== Infinity && (maxOnMs == null || pulseMs > maxOnMs)) {
      return {
         ok: false,
         maxOnMs,
         maxBranchKw,
         maxBranchFactor,
         maxTunnelKw,
         usedOnMsMax,
         remainingOnMsMin: remainingOnMsMin ?? null,
      };
   }

   return {
      ok: true,
      maxOnMs,
      maxBranchKw,
      maxBranchFactor,
      maxTunnelKw,
      usedOnMsMax,
      remainingOnMsMin: remainingOnMsMin ?? null,
   };
}


function scoreCombo(
   /*
   used: LoadBankBranch[],
   U2: number,
   relErrAbs: number
   */
   branches: LoadBankBranch[],
   absErrR: number,
   maxBranchFactor: number,
   maxTunnelKw: number
): number { 

   // Tunable weights — start conservative.
   const wE = 1.0;   //wR = 1.0; // weight of resistance error // main weight is error, but only used after preference comparator tie
   const wP = 0.5;   // penalty for branch overload // overload penalty above continuous
   const wT = 0.2;   // penalty for unbalanced tunnel power // tunnel imbalance penalty
   const wB = 0.05;  // penalty for having many branches // branch count penalty

   const overloadPenalty = Math.max(0, maxBranchFactor - 1); // ≥0 when over continuous
   const tunnelPenalty = maxTunnelKw / TUNNEL_CONT_KW;       // 1 ≈ 8 kW
   const branchPenalty = branches.length; //const branchPenalty = used.length; // prefer fewer branches    

   return wE * absErrR + wP * overloadPenalty + wT * tunnelPenalty + wB * branchPenalty;
}




/* ──────────────────────────────────────────────────────────────────────────────
   Error preference comparator
────────────────────────────────────────────────────────────────────────────── */

function bucketErrR(errR: number): 0 | 1 | 2 {
   // 0: true negatives (preferred) — but exclude "near-zero negatives" which we treat as positive-ish
   // 1: near-zero / small positive (includes -0.05%..0 and 0..+0.1%)
   // 2: other positive
   if (errR < -ZERO_AS_POS) return 0;
   if (errR <= POS_FINE_MAX) return 1;
   return 2;
}

function prefCostErrR(errR: number): number {
   const b = bucketErrR(errR);
   if (b === 0) return Math.abs(errR - TARGET_UNDER); // closest to -0.1%
   if (b === 1) return Math.abs(errR);                // closest to 0.0%
   return errR;                                       // smallest positive
}

function compareCandidates(a: ComboCandidate, b: ComboCandidate): number {
   // 1) Prefer within tolerance if available (soft rule, not a filter)
   if (!!a.outOfTolerance !== !!b.outOfTolerance) return a.outOfTolerance ? 1 : -1;

   // 2) Bucket + preference based on errR
   const ba = bucketErrR(a.errR);
   const bb = bucketErrR(b.errR);
   if (ba !== bb) return ba - bb;

   const pa = prefCostErrR(a.errR);
   const pb = prefCostErrR(b.errR);
   if (Math.abs(pa - pb) > 1e-12) return pa - pb;

   // 3) Thermal/balance/branch penalties
   if (Math.abs(a.score - b.score) > 1e-12) return a.score - b.score;

   // 4) Tie-breaks
   if (a.branches.length !== b.branches.length) return a.branches.length - b.branches.length;
   return a.absErrR - b.absErrR;
}

/* ──────────────────────────────────────────────────────────────────────────────
   Core solver
────────────────────────────────────────────────────────────────────────────── */


function findBestComboForCurrent(
   process: Process,
   targetCurrentA: number,
   maxRelError = DEV_ECHO_REL_ERROR
): ComboCandidate | null {
   if (
      !Number.isFinite(targetCurrentA) ||
      !targetCurrentA ||
      targetCurrentA <= 0
   ) return null;

   const nowMs = Date.now();
   lbDutyBudget.prune(nowMs);

   const u2V = calcU2(process, targetCurrentA);
   if (!Number.isFinite(u2V) || u2V <= 0) return null;

   const rTarget = u2V / targetCurrentA;
   const n = LB_BRANCHES.length;

   const candidates: ComboCandidate[] = [];

   for (let maskIndex = 1; maskIndex < (1 << n); maskIndex++) {
      const branches: LoadBankBranch[] = [];
      let invSum = 0;

      for (let i = 0; i < n; i++) {
         if (maskIndex & (1 << i)) {
            const b = LB_BRANCHES[i];
            branches.push(b);
            invSum += 1 / b.ohm;
         }
      }

      if (!branches.length || invSum === 0) continue;

      const reqOhm = 1 / invSum;
      const approxCurrentA = u2V / reqOhm;

      // Sheet-consistent error (this is what we rank on)
      const errR = (reqOhm - rTarget) / rTarget;
      const absErrR = Math.abs(errR);

      // Informational error (for labels/warnings only)
      const errI = (approxCurrentA - targetCurrentA) / targetCurrentA;
      const absErrI = Math.abs(errI);

      // Thermal feasibility for the expected measurement pulse
      const feas = isComboFeasibleForPulse(
         branches,
         u2V,
         RDP4000,
         MEAS_PULSE_MS,
         lbDutyBudget,
         nowMs
      );
      if (!feas.ok) continue;

      const score = scoreCombo(branches, absErrR, feas.maxBranchFactor, feas.maxTunnelKw);

      let mask = 0;
      for (const b of branches) mask |= b.maskBit;

      candidates.push({
         mask,
         branches,
         reqOhm,

         u2V,
         approxCurrentA,

         errI,
         absErrI,

         errR,
         absErrR,

         score,
         maxBranchKw: feas.maxBranchKw,
         maxBranchFactor: feas.maxBranchFactor,
         maxTunnelKw: feas.maxTunnelKw,

         maxOnMs: feas.maxOnMs,

         cycleMs: lbDutyBudget.cycleMs,
         usedOnMsMax: feas.usedOnMsMax,
         remainingOnMsMin: feas.remainingOnMsMin,

         // warning only (don’t filter)
         outOfTolerance: absErrR > maxRelError,
      });
   }

   dbg("[setpoints] solver input:", { 
      process, 
      targetCurrentA, 
      u2V, 
      rTarget, 
      maxRelError,
      cycleMs: lbDutyBudget.cycleMs, 
   });

   if (!candidates.length) {
      dbg("[setpoints] no feasible candidates");
      return null;
   }

   candidates.sort(compareCandidates);

   // Helpful peek at the top few
   const top = candidates.slice(0, 5).map((c) => ({
      mask: "0x" + c.mask.toString(16),
      branches: c.branches.map((b) => b.id),
      branchesLabel: c.branches.map((b) => b.id).join("+"),
      RerrPct: (c.errR * 100).toFixed(3),
      IerrPct: (c.errI * 100).toFixed(3),
      maxOnMs: c.maxOnMs,
      score: c.score.toFixed(6),
      outOfTol: !!c.outOfTolerance,
   }));
   dbg("[setpoints] top candidates:", top);

   return candidates[0];
}




// ──────────────────────────────────────────────────────────────────────────────
// Optional: UI helpers (warnings/labels)
// ──────────────────────────────────────────────────────────────────────────────

export type SetpointWarning = {
   kind: "warn" | "info";
   code:
      | "OUT_OF_TOL"
      | "POSITIVE_ERROR"
      | "LARGE_NEGATIVE"
      | "TIME_LIMITED"
      | "TUNNEL_IMBALANCE"
      | "OVER_CONTINUOUS";
   message: string;
};

export function getSetpointWarnings(
   c: ComboCandidate,
   cfg?: {
      // warn if |Rerr| above this (sheet-consistent)
      tolAbsR?: number; // default DEV_ECHO_REL_ERROR
      // warn if Rerr is positive above this (undercurrent)
      posWarnAboveR?: number; // default +0.1%
      // warn if Rerr is negative below this (overcurrent)
      negWarnBelowR?: number; // default -6%
      // warn if tunnel power above this (soft)
      tunnelKwWarnAbove?: number; // default 8kW
   }
): SetpointWarning[] {
   const tolAbsR = cfg?.tolAbsR ?? DEV_ECHO_REL_ERROR;
   const posWarnAboveR = cfg?.posWarnAboveR ?? 0.001; // +0.1%
   const negWarnBelowR = cfg?.negWarnBelowR ?? -0.06; // -6%
   const tunnelKwWarnAbove = cfg?.tunnelKwWarnAbove ?? 8.0;

   const w: SetpointWarning[] = [];

   if (Math.abs(c.errR) > tolAbsR) {
      w.push({
         kind: "warn",
         code: "OUT_OF_TOL",
         message: `Erro fora da tolerância (R): ${(c.errR * 100).toFixed(2)}%.`,
      });
   }

   if (c.errR > posWarnAboveR) {
      w.push({
         kind: "warn",
         code: "POSITIVE_ERROR",
         message: `Erro positivo elevado (R): ${(c.errR * 100).toFixed(2)}% (corrente abaixo do alvo).`,
      });
   }

   if (c.errR < negWarnBelowR) {
      w.push({
         kind: "warn",
         code: "LARGE_NEGATIVE",
         message: `Erro negativo elevado (R): ${(c.errR * 100).toFixed(2)}% (corrente acima do alvo).`,
      });
   }

   if (c.maxOnMs !== null && c.maxOnMs !== Infinity) {
      w.push({
         kind: "warn",
         code: "TIME_LIMITED",
         message: `Combinação com limite de tempo ON: ~${Math.round(c.maxOnMs / 1000)}s.`,
      });
   }

   if (c.maxTunnelKw > tunnelKwWarnAbove) {
      w.push({
         kind: "info",
         code: "TUNNEL_IMBALANCE",
         message: `Carga alta por túnel: ~${c.maxTunnelKw.toFixed(1)} kW.`,
      });
   }

   if (c.maxBranchFactor > 1) {
      w.push({
         kind: "info",
         code: "OVER_CONTINUOUS",
         message: `Acima da potência contínua em pelo menos um resistor (factor ~${c.maxBranchFactor.toFixed(2)}x).`,
      });
   }

   return w;
}

export function formatComboSummary(c: ComboCandidate): string {
   const comboLabel = c.branches
      .map((b) => b.id)
      .slice()
      .sort()
      .join(" + ");

   const rErrPct = c.errR * 100;
   const iErrPct = c.errI * 100;

   const maxOn =
      c.maxOnMs == null
         ? "impossível"
         : c.maxOnMs === Infinity
         ? "contínuo"
         : `${Math.round(c.maxOnMs / 1000)}s`;

   return `${comboLabel} · I≈${c.approxCurrentA.toFixed(0)}A · Ierr=${iErrPct.toFixed(
      2
   )}% · Req≈${c.reqOhm.toFixed(4)}Ω · Rerr=${rErrPct.toFixed(2)}% · tOn=${maxOn}`;
}
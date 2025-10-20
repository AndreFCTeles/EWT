import type { RangeSpec, SpecsVerdict } from '@/types/specsTypes';

export function computeWindow(range: RangeSpec): { 
  min?: number; 
  max?: number; 
  target?: number 
} {
  if (range.min != null || range.max != null) return { 
    min: range.min, 
    max: range.max, 
    target: range.target 
  };
  if (range.target == null) return {};
  const { abs = 0, pct = 0 } = range.tol || {};
  const delta = Math.max(abs, (range.target * (pct ?? 0)));
  return { 
    min: range.target - delta, 
    max: range.target + delta, 
    target: range.target 
  };
}

export function judge(value: number, range: RangeSpec): SpecsVerdict {
  const { min, max, target } = computeWindow(range);
  let pass = true;
  let reason = '';
  if (min != null && value < min) { 
    pass = false; 
    reason = `below min ${min}`; 
  }
  if (max != null && value > max) { 
    pass = false; 
    reason = reason ? reason + ', above max' : 'above max'; 
  }
  return { 
    pass, 
    value, 
    unit: range.unit, 
    min: min ?? undefined, 
    max: max ?? undefined, 
    target: target ?? undefined, 
    reason: pass ? undefined : reason 
  };
}

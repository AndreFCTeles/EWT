import type { Dut } from '@/types/checklistTypes';
import type { EolSpec } from '@/types/specsTypes';
import seed from '@/dev/specsSeed.json' assert { type: 'json' };
import type { Process, RatedCurrent } from '@/types/protocolTypes';

export async function loadSpecs(): Promise<EolSpec[]> {
  try {
    const r = await fetch('/api/specs');
    if (r.ok) return await r.json();
  } catch {}
  return seed as unknown as EolSpec[];
}

export async function getSpecForDut( ctx: {
  dut?: Dut;
  picks?: { process?: Process; power?: RatedCurrent; brand?: string };
  hints?: { model?: string; format?: string };
} ): Promise<EolSpec | null> {
  const specs = await loadSpecs();
  const tokens = [
    ctx.dut?.prodName, ctx.dut?.brand, ctx.dut?.format,
    ctx.picks?.brand, ctx.hints?.model, ctx.hints?.format,
  ].filter(Boolean).map(s => String(s).toLowerCase());
  
  const candidates = specs.filter(s =>
    tokens.some(t => s.model.toLowerCase().includes(t))
  );

  const process = ctx.dut?.processes?.[0] ?? ctx.picks?.process;
  const withProc = candidates.find(s => !s.processes || !process || s.processes.includes(process));
  return withProc || candidates[0] || null;
}
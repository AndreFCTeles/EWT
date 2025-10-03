export type TolAbs = { 
   kind: 'abs'; 
   abs: number 
};
export type TolPct = { 
   kind: 'pct'; 
   pct: number 
};
export type TolCombo = { 
   kind: 'combo'; 
   abs: number; 
   pct: number 
};
export type TolPiece = { 
   kind: 'piecewise'; 
   rules: Array<{ 
      upTo: number; 
      tol: Exclude<Tol, {kind:'piecewise'}> 
   }> 
};
export type Tol = TolAbs | TolPct | TolCombo | TolPiece;

export const verdict = (
   reading: number, target: number, tol: Tol
): 'pass' | 'warn' | 'fail' => {
   const within = (d: number) => Math.abs(reading - target) <= d;

   const evalTol = (t: Tol): boolean => {
      switch (t.kind) {
         case 'abs': return within(t.abs);
         case 'pct': return within((t.pct/100) * target);
         case 'combo': return within(t.abs + (t.pct/100) * target);
         case 'piecewise': {
            const rule = t.rules.find(r => target <= r.upTo) ?? t.rules.at(-1);
            return rule ? evalTol(rule.tol) : false;
         }
      }
   };

   return evalTol(tol) ? 'pass' : 'fail'; // add 'warn' logic later if you want a yellow band
}

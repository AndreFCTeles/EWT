import React, { useEffect, useRef } from 'react';
import type { StepRuntimeProps } from './pipeline';
import { nowIso } from '@utils/generalUtils';




const SkipStep: React.FC<StepRuntimeProps> = ({ id, isActive, complete }) => {
   const ran = useRef(false);

   useEffect(() => {
      if (!isActive) return; 
      if (ran.current) return;
      ran.current = true;

      const now = nowIso();
      complete({ 
         id, 
         startedAt: now, 
         endedAt: now, 
         verdict: 'skipped',
         notes: ["Passo não implementado (placeholder)."],
      });
      console.log(`Step: "${id}" - skipped (placeholder)`);
   }, [id, complete]);

   return null;
};

export default SkipStep;
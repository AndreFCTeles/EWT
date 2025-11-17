import React, { useEffect } from 'react';
import type { StepRuntimeProps } from './pipeline';
import { nowIso } from '@utils/generalUtils';




const SkipStep: React.FC<StepRuntimeProps> = ({ id, isActive, complete }) => {
   useEffect(() => {
      if (!isActive) return; 
      const now = nowIso();
      complete({ 
         id, 
         startedAt: now, 
         endedAt: now, 
         verdict: 'skipped' 
      });
      console.log(`Step: "${id}" - skipped`);
   }, [id, complete]);
   return null;
};

export default SkipStep;
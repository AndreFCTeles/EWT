import React, { useEffect } from 'react';
import type { StepRuntimeProps } from './pipeline';
import { nowIso } from '@utils/generalUtils';

//const SkipStep: React.FC<StepRuntimeProps> = () => null; // OLD

const SkipStep: React.FC<StepRuntimeProps> = ({ id, complete }) => {
   useEffect(() => {
      const now = nowIso();
      complete(
         { 
            id, 
            startedAt: now, 
            endedAt: now, 
            verdict: 'skipped' 
         } // , { manualSelect: true }
      );
      console.log(`Step: "${id}" - skipped`);
   }, [id, complete]);
   return null;
};


export default SkipStep;
import React, { useEffect } from 'react';
import type { StepRuntimeProps } from './pipeline';
import { nowIso } from '@/services/utils/generalUtils';

//const SkipStep: React.FC<StepRuntimeProps> = () => null; // OLD

const SkipStep: React.FC<StepRuntimeProps> = ({ id, complete }) => {
   useEffect(() => {
      const now = nowIso();
      complete({ 
         id, 
         startedAt: now, 
         endedAt: now, 
         verdict: 'skipped' 
      });
   }, [id, complete]);
   return null;
};


export default SkipStep;
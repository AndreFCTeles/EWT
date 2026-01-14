
import React, { useEffect, useState, useRef, useMemo } from "react";
import { Button, NumberInput, Title, Text, Badge, SimpleGrid, Flex, ScrollArea, Box } from "@mantine/core";
import type { LoadBankProbe, LoadBankStatus, SetpointConfig } from "@/types/commTypes";
import type { StepRuntimeProps } from '@checklist/pipeline';


/*
type LBBadgeProps = { 
   hasLoadBank?: string; 
   bankStatus?: boolean;
   onBack?: () => void;
   center?: React.ReactNode; 
   right?: React.ReactNode; 
   children: React.ReactNode; 
}
*/

const LBBadge: React.FC<StepRuntimeProps> = ( {
   submission,
} ) => {
   const vars = submission.vars ?? {};
   const loadBank = vars.loadBank as LoadBankProbe | undefined;

   const hasLoadBank = !!(loadBank && loadBank.connected);
   const portName = loadBank?.connected ? loadBank?.portName ?? "" : "";
   const [bankStatus, setBankStatus] = useState<LoadBankStatus | null>(
      loadBank?.connected ? loadBank?.status ?? null : null
   );
   
      const badge = hasLoadBank && bankStatus ? (
         <Badge color="green" variant="light">
            Banca {loadBank!.bank_power}A #{loadBank!.bank_no} · {portName}
         </Badge>
      ) : (
         <Badge color="red" variant="light">
            Banca offline
         </Badge>
      );

      return badge;

   }

   export default LBBadge;
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Card, Stack, Button, Title, ScrollArea, SimpleGrid, Flex, Box } from '@mantine/core';
import LBBadge from '@/components/comm/LBBadge';
import classes from '@/styles/PPButtons.module.css'




function useElementSize<T extends HTMLElement>() {
   const ref = useRef<T | null>(null);
   const [height, setHeight] = useState(0);

   useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;

      const update = () => setHeight(el.getBoundingClientRect().height);

      update();

      // React to size changes
      const ro = new ResizeObserver(() => update());
      ro.observe(el);

      return () => ro.disconnect();
   }, []);

   return { ref, height };
}


type SSProps = { 
   title?: string; 
   canGoBack?: boolean;
   onBack?: () => void;
   center?: React.ReactNode; 
   right?: React.ReactNode; 
   children: React.ReactNode; 
}

export const StepShell: React.FC<SSProps> = ( { 
   title, 
   canGoBack, 
   onBack, 
   //center,
   right, 
   children 
} ) => {
   const { 
      ref: cardRef, 
      height: cardH 
   } = useElementSize<HTMLDivElement>();
   const { 
      ref: headerRef, 
      height: headerH 
   } = useElementSize<HTMLDivElement>();

   const scrollH = useMemo(() => {
      const h = Math.max(0, cardH - headerH);// Prevent negative heights
      return h;
   }, [cardH, headerH]);
   
   return (
      <Card 
      ref={cardRef as any}
      p={0} 
      h={"100%"}
      mih={"100%"}
      shadow={"sm"}
      withBorder >

         <Box ref={headerRef}>
            <SimpleGrid 
            ref={headerRef}
            cols={3}
            p={"md"}
            m={0} 
            className={"stepShellHeader"} >
               <Flex
               align={"center"} 
               justify={"flex-start"}
               >{canGoBack && <Button 
                     size="xl" 
                     variant="light" 
                     onClick={onBack}
                     >Anterior</Button>
               }</Flex>

               <Flex
               align={"center"} 
               justify={"center"}
               >
                  <Stack
                  align={"center"} 
                  justify={"center"}>
                     <Title order={1} fw={600}>{title}</Title>
                     <LBBadge />
                     {/*center*/}
                     {/*center ?? <LBBadge submission={submission} />*/}
                  </Stack>
               </Flex>

               <Flex
               align={"center"} 
               justify={"flex-end"}
               >{right}</Flex>
            </SimpleGrid>
         </Box>

         <Box style={{ height: scrollH, minHeight: 0 }}>
            <ScrollArea
            className={classes.PPScrollArea}
            style={{ height: "100%" }}
            p={"md"}
            >{children}</ScrollArea>
         </Box>
      </Card>
   )
};
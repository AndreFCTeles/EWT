import React, { useState } from "react";
import { 
   Button, 
   Flex, 
   Text, 
   Transition, 
   type ButtonProps, 
   type ElementProps 
} from "@mantine/core";
import { IconInfoSmall } from "@tabler/icons-react";


type SetpointButtonProps =
   ButtonProps &
   ElementProps<"button", keyof ButtonProps> & {
      ampsText: string;
      setpointLine: string;
      infoLines: [string, string, string];
      resistors: React.ReactNode;
   };

const coverFromLeft = {
   in: { opacity: 1, transform: "translateX(0%)" },
   out: { opacity: 0, transform: "translateX(-110%)" },
   transitionProperty: "transform, opacity",
};


const SetpointButton: React.FC<SetpointButtonProps> = ( {
   ampsText,
   setpointLine,
   infoLines,
   resistors,
   styles: stylesProp,
   ...buttonProps
} ) => {
   const [showInfo, setShowInfo] = useState(false);

   return (
      <Button.Group maw="100%" miw="100%">
         <Button 
         p={0} 
         m={0}
         h={'auto'}
         maw={"20%"}
         miw={"20%"}
         color={showInfo?"rgba(47, 158, 68, 0.5) ":"rgba(47, 158, 68, 1)"}
         variant={"filled"}
         className={"POWERBTN"}
         onClick={() => setShowInfo(v => !v)}>
            <IconInfoSmall stroke={1.5} width={"100%"} height={"100%"} color={"white"} />
         </Button>

         <Button
         className="POWERBTN" 
         color={"green"}
         maw={"80%"}
         miw={"80%"} 
         h={'auto'}
         m={0} 
         p={0}
         {...buttonProps}
         styles={{ label: {width: "100%"} }}>
            <Flex 
            p={0}
            m={0} 
            h={"100%"}
            w={"100%"}
            mih={"100%"}
            miw={"100%"}
            align={"stretch"}
            style={{
               position: "relative",
               borderRadius: "inherit",
            }} >
               {/* Info pane */}
               <Transition
               mounted={showInfo}
               transition={coverFromLeft}
               duration={220}
               timingFunction="cubic-bezier(0.22, 1, 0.36, 1)" 
               keepMounted
               >
                  {(transitionStyles) => (
                     <Flex 
                     h={"100%"}
                     w={"100%"}
                     mih={"100%"}
                     miw={"100%"}
                     align={"stretch"}
                     justify={"center"}
                     direction={"column"}
                     style={{
                        ...transitionStyles,
                        position: "absolute",
                        inset: 0,
                        borderRadius: "inherit",
                        pointerEvents: "none",
                     }} >
                        <Text size="xs" w={"100%"}>{infoLines[0]}</Text>
                        <Text size="xs" w={"100%"}>{infoLines[1]}</Text>
                        <Text size="xs" w={"100%"}>{infoLines[2]}</Text>
                     </Flex>
                  )}
               </Transition>

               {/* Setpoint pane */}
               <Flex 
               p={0} 
               m={0}
               h={"100%"}
               w={"100%"}
               mih={"100%"}
               miw={"100%"}
               align={"stretch"}
               justify={"center"}
               style={{
                  transition: "opacity 150ms ease, transform 180ms ease",
                  opacity: showInfo ? 0.1 : 1,
                  transform: showInfo ? "scale(0.98)" : "scale(1)",
               }} >
                  <Flex 
                  w={"calc(100% - 91px)"}
                  direction={"column"}
                  align={"stretch"}
                  justify={"center"}>
                     <Text 
                     lh="100%" 
                     fw={600}
                     c={"green"}
                     className="POWER" >
                        {ampsText}
                     </Text>
                     <Text>{setpointLine}</Text>
                  </Flex>
                  <Flex
                  align={"center"}
                  justify={"center"}
                  w={"91px"}>
                     {resistors}
                  </Flex> 
               </Flex>
            </Flex>
         </Button>
      </Button.Group>
   );
}



export default SetpointButton;

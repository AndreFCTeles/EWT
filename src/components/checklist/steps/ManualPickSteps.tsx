import { useEffect, useState } from 'react';
import { Button, Loader, Stack, Text,Flex, Box, SimpleGrid, RangeSlider, Slider, NumberInput, Switch, Checkbox } from '@mantine/core';
import { notifications } from "@mantine/notifications";

import type { StepRuntimeProps } from '@checklist/pipeline';
import { StepShell } from '@checklist/StepShell';

import { fetchBrands } from '@/services/api/epmApi';
import { nowIso } from '@utils/generalUtils';
import { API_URL } from '@/lib/config';
import { Process} from '@/types/checklistTypes';//, RatedCurrent 
import { PROCESSES, POWERS } from '@/types/checklistTypes';
import classes from '@/styles/PPButtons.module.css'
import { useLoadBankRuntime } from '@/hooks/useLoadBankRuntime';


   const notify = (msg: string) => {
      notifications.show({
         color: "orange",
         title: "Faltam dados",
         message: msg,
      });
   };







// ---- PickProcess ----
export const PickProcessStep: React.FC<StepRuntimeProps> = ( { 
   id, 
   submission,
   canGoBack, 
   goBack, 
   complete
} ) => {
   const [selectedProcess, setSelectedProcess] = useState<Process | undefined>(submission?.vars?.selectedProcess);
   const [phaseSwitch, setPhaseSwitch] = useState<boolean>(false);
   //const [selectedPhase, setSelectedPhase] = useState<"230"|"400">("230");

   
   console.log("PickProcessStep submission");
   console.log(submission);

   const pick = (p: Process) => {
      complete(
         { 
            id, 
            startedAt: nowIso(), 
            endedAt: nowIso(), 
            inputs: { process: p }, 
            verdict: 'pass' 
         }, { selectedProcess: p }
      );
   };

   const NextBTN = () =>   <Button 
                           size="xl"
                           onClick={() => 
                              selectedProcess ? pick(selectedProcess)
                              : notify("Selecione processo antes de prosseguir")
                           }>Confirmar</Button>
   return (
      <StepShell 
      title="Tipo de soldadura" 
      canGoBack={canGoBack} 
      onBack={goBack}
      right={NextBTN()}>
         <Flex
         w={"100%"}
         h={"100%"}>   
            <SimpleGrid 
            w={"70%"}
            cols={2}
            className={classes.PPRoot}>
               {PROCESSES.map(p => (
                  <Button 
                  key={p} 
                  className={classes.PPBtn} 
                  variant={selectedProcess === p ? 'filled' : 'outline'}
                  onClick={() => setSelectedProcess(p)}>{
                     p === "MIGConv" ? "MIG Conv." : 
                     p === "MIGInv" ? "MIG Inverter" :
                     p 
                  }</Button>
               ))}
            </SimpleGrid>

            {/* Dyn option selectors */}
            <Box w={"30%"}>

               {/*<Title order={2} ta={"center"} mb={0} pb={0}>Tensão de Vazio</Title>
               <Flex
               w={"100%"} 
               pb={"xl"}
               justify={'space-around'}>*/}
                  <NumberInput
                  mb={"md"}
                  mx={"sm"}
                  label="Tensão de Vazio" />
               {/*</Flex>*/}

               {/*<Title order={2} ta={"center"} mb={0} pb={0}>{
                  selectedProcess === 'MIGInv' 
                  ? 'Tensão'
                  : 'Corrente'
               } de Controlo</Title>
               <Flex
               w={"100%"} 
               pb={"xl"}
               justify={'space-around'}>*/}

                  <NumberInput
                  mb={"md"}
                  mx={"sm"}
                  label={`${
                     selectedProcess === 'MIGInv' 
                     ? 'Tensão'
                     : 'Corrente'
                  } de Controlo
                  `} />
               {/*</Flex>*/}

               <Text ta={"center"} mb={0} pb={0}>Tensão de alimentação</Text>

               {/*<SimpleGrid
               w={"100%"} 
               pt={0}
               pb={"md"}
               cols={3}
               spacing={0}>
                  <Stack 
                  align='flex-end' 
                  p={0} my={'auto'}
                  ml={'auto'} mr={0} 
                  gap={0}>
                     <Text
                     size={"xl"} 
                     c={!phaseSwitch?"":"dimmed"}  
                     m={0} p={0}
                     >230V AC</Text>
                     <Text 
                     m={0} p={0} 
                     fw={600} 
                     size={"sm"} 
                     c={"dimmed"}>(monofásica)</Text>
                  </Stack>*/}

                  <Flex mb={"md"}>
                     <Switch 
                     classNames={classes} 
                     checked={phaseSwitch}
                     onChange={(event) => setPhaseSwitch(event.currentTarget.checked)}
                     m={"auto"}
                     size={'xl'}
                     onLabel={ <Stack gap={0} 
                        mr={0} pr={0}>
                        <Text
                        c={"#ffffff"}
                        >400V AC</Text>
                        <Text 
                        fw={600} 
                        size={"sm"} 
                        c={"#adb5bd"}
                        >(trifásica)</Text>
                     </Stack> }
                     offLabel={ <Stack gap={0} >
                        <Text 
                        c={"#ffffff"}
                        >230V AC</Text>
                        <Text 
                        fw={600} 
                        size={"sm"} 
                        c={"#adb5bd"}
                        >(monofásica)</Text>
                     </Stack> } />
                  </Flex>

                  {/*<Stack 
                  align='flex-start'
                  p={0} my={'auto'}
                  mr={'auto'} ml={0} 
                  gap={0}>
                     <Text
                     size={"xl"} 
                     c={phaseSwitch?"":"dimmed"} 
                     m={0} p={0}
                     >400V AC</Text>
                     <Text 
                     m={0} p={0} 
                     fw={600} 
                     size={"sm"} 
                     c={"dimmed"}>(trifásica)</Text>
                  </Stack>
               </SimpleGrid>*/}


               <Flex w={"100%"} mt={"sm"}>
                  <Stack w={"60%"} mx="auto">
                     <Checkbox
                     size="md"
                     label="Permite leitura de tensão em tempo real" />
                     <Checkbox
                     size="md"
                     label="Permite leitura de corrente em tempo real" />
                  </Stack>
               </Flex>
            </Box>
         </Flex>

      </StepShell>
   );
};












// ---- PickPower ----
export const PickPowerStep: React.FC<StepRuntimeProps> = ( { 
   id, 
   submission,
   canGoBack, 
   goBack, 
   complete 
} ) => {
   // min max inits
   const lb = useLoadBankRuntime();
   const powers = lb.bankPower ? POWERS.filter((p) => p > lb!.bankPower!) : POWERS; 
   const process = submission?.vars?.selectedProcess;
   const minPowerVar = submission?.vars?.minPowerA ? submission.vars.minPowerA : 15
   const powerVar = submission?.vars?.powerA ? submission.vars.powerA : 600
   const [sliderMin, setSliderMin] = useState<number>(minPowerVar);
   const [sliderMax, setSliderMax] = useState<number>(powerVar);
   const [sliderRange, setSliderRange] = useState<[number,number]>([sliderMin,sliderMax]);
   // min max updates
   useEffect(()=>{ // min/max changes update ranges
      setSliderRange([sliderMin,sliderMax]);
   }, [sliderMin, sliderMax]);
   useEffect(()=>{ // range changes update max min
      setSliderMin(sliderRange[0]);
      setSliderMax(sliderRange[1]);
   }, [sliderRange]);



   console.log("PickPowerStep submission");
   console.log(submission);

   
   // NEXT
   const pick = (mina: number, a: number) => {
      complete({ 
         id, 
         startedAt: nowIso(), 
         endedAt: nowIso(), 
         inputs: { ratedCurrent: a }, 
         verdict: 'pass' 
      }, { 
         minPowerA: process !== 'MIGConv' ? mina : null,
         powerA: a 
      });
   };

   // Render
   const NextBTN = () =>   <Button 
                           size="xl"
                           onClick={() => pick(sliderMin, sliderMax)}
                           >Confirmar</Button>
   
   return (
      <StepShell 
      title="Potência" 
      canGoBack={canGoBack} 
      onBack={goBack}
      right={NextBTN()}> 
         <Stack className={classes.PPRoot} w={"100%"} >

            <Box h={"40%"} w={"100%"} style={{ overflow: "hidden"}}>
               <Flex h={"100%"} align={"center"} justify={"center"}> 
                  
                  {process !== 'MIGConv' && 
                     <NumberInput 
                     min={15}
                     max={1000}
                     size="xl"
                     suffix=' A'
                     stepHoldDelay={500}
                     stepHoldInterval={10}
                     value={sliderMin}
                     label={"Mínimo"}
                     onChange={(val) => { setSliderMin(Number(val)) }} />
                  }

                  {process === 'MIGConv' ? 
                     <Slider 
                     w={"100%"}
                     mx={"md"}
                     color="blue"
                     size="xl"
                     domain={[0,1000]}
                     labelAlwaysOn
                     min={15}
                     max={1000}
                     value={sliderMax}
                     onChange={setSliderMax}
                     marks={[ // talvez usar marcas dinamicas apenas em viewports grandes
                        ...powers.map( a => ( { value: a, label: a.toString() } ))
                     ]} />
                  :
                     <RangeSlider 
                     w={"100%"}
                     mx={"md"}
                     color="blue"
                     size="xl"
                     domain={[0,1000]}
                     labelAlwaysOn
                     min={15}
                     max={1000}
                     value={sliderRange}
                     onChange={setSliderRange}
                     marks={[ //talvez usar marcas dinamicas apenas em viewports grandes
                        { value: 15, label: "15" },
                        ...powers.map( a => ({ value: a, label: a.toString() }) )
                     ]} />
                  }

                  <NumberInput 
                  min={15}
                  max={1000}
                  size="xl"
                  suffix=' A'
                  stepHoldDelay={500}
                  stepHoldInterval={10}
                  value={sliderMax}
                  label={"Máximo"}
                  onChange={(val) => { setSliderMax(Number(val)) }} />
               </Flex>
            </Box>

            <SimpleGrid 
            h={"60%"}
            cols={3}>
               {powers.map(a => (
                  <Button 
                  size='xl' 
                  key={a} 
                  variant={a===sliderMax?'filled':'outline'}
                  onClick={()=>setSliderMax(a)}
                  >{a}A</Button>
               ))}
            </SimpleGrid>

         </Stack>
      </StepShell>
   );
};














// ---- PickBrand ----
export const PickBrandStep: React.FC<StepRuntimeProps> = ({ id, canGoBack, goBack, complete, submission }) => {
   const [brands, setBrands] = useState<string[]>([]);
   const [loading, setLoading] = useState(true);


   
   console.log("PickBrandStep submission");
   console.log(submission);


   useEffect(() => {
      let live = true;
      (async () => {
         setLoading(true);
         try {
            const b = await fetchBrands(API_URL);
            if (live) setBrands(b);
         } finally { if (live) setLoading(false); }
      })();
      return () => { live = false; };
   }, []);

   const pick = (brandName: string) => {
      const now = nowIso();
      complete(
         { 
            id, 
            startedAt: now, 
            endedAt: now, 
            inputs: { brand: brandName }, 
            verdict: 'pass' 
         }, { brand: brandName }
      );
   };

   return (
      <StepShell 
      title="Identificação" 
      canGoBack={canGoBack} 
      onBack={goBack}>
         {loading ? 
            <Stack>
               <Text size="sm">A carregar marcas…</Text>
               <Loader />
            </Stack> 
         :
            <SimpleGrid cols={3}>
               {brands.map(b => <Button 
               key={b} 
               size='xl'
               variant="filled" 
               onClick={() => pick(b)}
               >{b}</Button>)}
            </SimpleGrid>
         }
         {/*
            <ScrollArea h={220}>
               <Group wrap="wrap" gap="xs">
                  {brands.map(b => <Button 
                  key={b} 
                  variant="default" 
                  onClick={() => pick(b)}
                  >{b}</Button>)}
               </Group>
            </ScrollArea>
         */ }
      </StepShell>
   );
};

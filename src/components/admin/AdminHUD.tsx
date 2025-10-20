import React from 'react';
import { Card, List, ScrollArea, Text } from '@mantine/core';
import { Submission } from '@/types/checklistTypes';
import FilePicker from '@/components/dialog/FilePicker';
import SerialInspectorMini from "@/components/comm/SpeakFFS";


export const AdminHUD: React.FC<{ 
   submission: Submission, 
   importstyle: any, 
   uiView: "basic" | "advanced",
   user: string | undefined 
}> = ({ submission, importstyle, uiView, user }) => {
   const operator = user ? user : submission.header.operator;
   const prod = submission.dut ? submission.dut.prodName : '' ;
   const serialno = submission.dut ? submission.dut.serialno ? submission.dut.serialno : 'PF_____' : '';

   return (
      <Card miw={280} maw={280} style={{ ...importstyle}} mx={0} p={0} bg={'none'}>
         <Text fw={600} mb="xs">Painel Admin</Text>
         <List size="sm" mb={'md'}>
            <List.Item>Operador: {/*submission.header.operator*/}{operator}</List.Item>
            <List.Item>DUT: {`${serialno} - `} {prod}</List.Item>
            <List.Item>Passos: {submission.steps.length}</List.Item>
         </List>
         { uiView==='advanced' && (
            <>
               <FilePicker />
               <ScrollArea offsetScrollbars p={0} type="always" mt={'sm'}>
                  <SerialInspectorMini />{/* defaultPort="COM5" defaultBaud={115200} listenMs={500} />*/}
               </ScrollArea>
            </>
         )}
      </Card>
   );
};

import React from 'react';
import { Card, List} from '@mantine/core';

import ToolSelector from '../toolcal/ToolSelector';
import { Process, Submission } from '@/types/checklistTypes';
import { Brand } from '@/types/generalTypes';


type Props = {
   onOpenToolCalibration: (instrumentCode: string) => void;
   submission: Submission;
   importstyle: any;
   uiView: "basic" | "advanced";
   user: string | undefined;
   role: string | undefined;
};

export const AdminHUD: React.FC<Props> = ({ onOpenToolCalibration, submission, importstyle,  user, role }) => {//uiView,
   const operator = user ? user : submission.header.operator;
   const authlvl = role ? role : '';
   const prod = submission.dut ? submission.dut.prodName : '' ;
   const serialno = submission.dut ? submission.dut.serialno ? submission.dut.serialno : '' : '';

   
   const vars = submission.vars ?? {};
   const brand = vars.brand as Brand | undefined;
   const brandStr = `${brand} - `;
   const process = vars.selectedProcess as Process | undefined;
   const processStr = process === 'MIGConv' || process === 'MIGInv' ? "MIG " : `${process} `;
   const powerA = vars.powerA as number | undefined; 
   const powerAStr = `${powerA}`;

   return (
      <Card miw={280} maw={280} style={{ ...importstyle}} mx={0} p={0} bg={'none'}>
         <List size="sm" mb={'md'}>
            <List.Item>{authlvl} - {operator}</List.Item>
            { prod && <List.Item>DUT: {`${serialno} - `} {prod}</List.Item> }
            { vars.selectedProcess && <List.Item>
               {brand && brandStr}
               {process && processStr}
               {powerA && powerAStr}
            </List.Item> }
            {process === 'MIGConv' && <List.Item>MIG Convencional</List.Item>}
            {process === 'MIGInv' && <List.Item>MIG Inverter</List.Item>}
            <List.Item>Passos: {submission.steps.length}</List.Item>
         </List>
         <ToolSelector onOpenToolCalibration={onOpenToolCalibration}  />
      </Card>
   );
};

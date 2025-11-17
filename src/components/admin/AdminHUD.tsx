import React from 'react';
import { Card, List} from '@mantine/core';
import { Submission } from '@/types/checklistTypes';

import ToolSelector from '../toolcal/ToolSelector';


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

   return (
      <Card miw={280} maw={280} style={{ ...importstyle}} mx={0} p={0} bg={'none'}>
         <List size="sm" mb={'md'}>
            <List.Item>{authlvl} - {operator}</List.Item>
            <List.Item>DUT: {`${serialno} - `} {prod}</List.Item>
            <List.Item>Passos: {submission.steps.length}</List.Item>
         </List>
         <ToolSelector onOpenToolCalibration={onOpenToolCalibration}  />
      </Card>
   );
};

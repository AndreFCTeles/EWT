import React from 'react'
import { Stack, Button } from '@mantine/core';



interface processProps {

   

};





const Process:React.FC<processProps> = ({}) => {
   return (
   
      <Stack 
      justify="space-around"
      align="stretch"
      style={{ minHeight: "100vh" }}
      p={'lg'}
      >
         <Button 
         fullWidth 
         className='processBtn'
         radius={'xl'} 
         >TIG</Button>
         
         <Button 
         fullWidth 
         className='processBtn'
         radius={'xl'} 
         >MIG</Button>
         
         <Button 
         fullWidth 
         className='processBtn'
         radius={'xl'} 
         >MMA</Button>
      </Stack>
   )
}

export default Process;
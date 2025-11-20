import { Dut } from "./checklistTypes";
import { ProductData } from "./productTypes";





export type DutProfileOrigin = 'profile' | 'product';// | string;

export type DutProfileKey = string; // e.g. brand::prodName::series::catPath

export type DutProfile = {
   origin: DutProfileOrigin;  // 'profile' from Perfis or 'product' from Produtos
   sourceId: string;          // Perfis._id or Produtos._id

   dutSnapshot: Dut;            // canonical DuT view
   productId?: string;
   productSnapshot?: ProductData;
   /*
   // Human ID
   brand: string;
   prodName: string;
   series?: string;

   // Category path
   categoryMain?: string;     // 'maq'
   categorySub?: string;      // 'maq-mig', 'maq-tig', 'maq-mma', ...
   categorySubSub?: string;   // 'maq-mig-bas', etc.
   format?: string;           // 'maq-mig-f-com', 'maq-mig-f-mod', ...
   */


   // Useful derived fields
   key: string;                 // brand::prodName::series::catPath
   supply?: { 
      phases: number; 
      voltage: number; 
      freqHz: number 
   };                         // from "3x400" etc
   ocv?: number | null;       // Open Circuit Voltage / Tensão de vazio

   updatedAt?: string;        // ISO, from Perfis.updatedDate or Produtos.updatedDate
};

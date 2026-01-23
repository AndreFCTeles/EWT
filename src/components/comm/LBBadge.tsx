import React from "react";
import { Badge, Tooltip } from "@mantine/core";
//import useLoadBankLive from "@/hooks/useLBHealth";
import { useLoadBankRuntime } from "@/hooks/useLoadBankRuntime";

//type Props = { portName: string | null; };

const LBBadge: React.FC = () => {//<Props> = ({ portName }) => {
   //const { status, health, online } = useLoadBankLive(portName);
   const lb = useLoadBankRuntime();

   if (lb.phase === "probing") {
      return <Badge variant="light" color="yellow">A procurar banca…</Badge>;
   }

   if (!lb.portName) {
      return <Badge variant="light" color="red">Banca offline</Badge>;
   }

   if (!lb.online) {
      const reason = lb.reason ?? "Trama inválida";
      return (
         <Tooltip label={reason}>
            <Badge variant="light" color="orange">Erro de conexão</Badge>
         </Tooltip>
      );
   }

   // detected + monitoring started, waiting first health/frame
   if (lb.online === null) {
      return <Badge variant="light" color="yellow">Banca detetada · a sincronizar…</Badge>;
   }

   const color = lb.hasErrors ? "yellow" : "green";
   return (
      <Badge variant="light" color={color}>
         Banca {lb.bankPower ?? "?"}A #{lb.bankNo ?? "?"} · {lb.portName}
         {lb.hasErrors ? " · erro" : ""}
      </Badge>
   );
};

export default LBBadge;
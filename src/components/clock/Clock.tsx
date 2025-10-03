import dayjs from "@/lib/dayjs-setup";
import useClock from "@/hooks/useClock";

const Clock: React.FC = () => {
   const now = useClock();
   return <span>{dayjs(now).format("HH:mm:ss")}</span>;
}

export default Clock;
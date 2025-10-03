import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
//import dayjs from '@/lib/dayjs-setup';

type Tick = { epoch_ms: number };

export default function useClock() {
   const [now, setNow] = useState<number>(() => Date.now());
   useEffect(() => {
      let unlisten: (() => void) | undefined;
      let mounted = true;

      
      invoke<number>("clock_now")
         .then((ms) => { if (mounted) setNow(ms); })
         .catch(() => { /* ignore; we'll get the first tick soon */ });

      (async () => {
         console.debug("[clock] subscribing");
         unlisten = await listen<Tick>("clock:tick", ({ payload }) => {
         if (mounted) setNow(payload.epoch_ms);
         });
      })();
      return () => { mounted = false; unlisten?.(); };
   }, []);
   return now; // epoch ms
}

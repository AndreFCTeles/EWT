// In your React code
import { invoke } from "@tauri-apps/api/core";

async function quickTest() {
   // 1) (Optional) list ports
   const ports = await invoke<string[]>("list_ports");
   console.log("Ports:", ports);

   // 2) connect to COM5 @ 115200
   await invoke("connect", { portName: "COM5", baud: 115200 });

   // 3) send a payload and listen ~500 ms
   const res = await invoke<{
      sent_ascii: string;
      sent_hex: string;
      recv_hex: string;
      recv_ascii: string;
   }>("test_roundtrip", { payload: "ABC 123\r\n", durationMs: 500 });

   console.log("Sent ASCII:", res.sent_ascii);
   console.log("Sent HEX  :", res.sent_hex);
   console.log("Recv HEX  :", res.recv_hex);
   console.log("Recv ASCII:", res.recv_ascii);

   // 4) close when done
   await invoke("close");
}

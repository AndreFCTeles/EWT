// Abstraction. TODO: Replace with real I/O (WebUSB/HID/Tauri IPC)
export type InterlockState = {
   enclosureClosed: boolean;
   eStopReleased: boolean;
   gasOk?: boolean;
   coolantOk?: boolean;
   mainsOk?: boolean;
   polarityContinuity?: 'ok' | 'reversed' | 'open' | 'unknown';
};

export type Signals = {
   getInterlocks(): Promise<InterlockState>;
   subscribeInterlocks(cb: (s: InterlockState) => void): () => void;

   measureOCV(): Promise<{ voltage: number }>;

   // stream API - high-rate logging
};

class SignalsClass implements Signals {
   private state: InterlockState = {
      enclosureClosed: true,
      eStopReleased: true,
      gasOk: true,
      coolantOk: true,
      mainsOk: true,
      polarityContinuity: 'ok',
   };
   private listeners = new Set<(s: InterlockState) => void>();

   async getInterlocks() { return this.state; }
   subscribeInterlocks(cb: (s: InterlockState) => void) {
      this.listeners.add(cb);
      cb(this.state);
      return () => this.listeners.delete(cb);
   }
   async measureOCV() { return { voltage: 78.9 }; }
}

export const signals: Signals = new SignalsClass();

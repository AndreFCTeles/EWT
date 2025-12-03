
// DEV VARS



export const DEV_FORCE_MODE = 'manual';

export const DEV_STUB_CONNECTED = true;

export const DEV_STUB_DB_MATCH = true;





export const DEV = { 
   DETECTION_MODE: 'manual',
   ENABLE_STUBS: true, 
   MAX_SEARCH_RESULTS: 50, 
   STUB_LATENCY_MS: 80, 
   VERBOSE_LOGS: true 
} as const;
export const DEFAULT_SERIAL = { 
   port:'COM5', 
   baudRate:115200, 
   dataBits:8, 
   stopBits:1, 
   parity:'none', 
   rtscts:false 
};
export const DEFAULT_FRAME = { 
   sof:0xaa, 
   esc:null, 
   eof:null, 
   useCrc:'CRC8', 
   littleEndian:true, 
   maxPayload:256 

};
//export const STUB_DUTS = [] as import('@/types/commTypes').Dut[];
export const STUB_READINGS = [] as import('@/types/commTypes').MultimeterReading[];



export const DEV_ECHO_ENABLED = true; 
export const DEV_ECHO_PORT = "COM5";
export const DEV_ECHO_POWER = 1000;
export const DEV_ECHO_BANK_NO = 1;
export const DEV_ECHO_BAUD = 115200;
export const DEV_ECHO_DELAY = 500;
export const DEV_ECHO_COUNT = 4;
export const DEV_ECHO_REL_ERROR = 0.06;
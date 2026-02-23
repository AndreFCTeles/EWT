import { Unit } from "./checklistTypes";


/* ──────────────────────────────────────────────────────────────────────────────
   Load bank protocol constants
────────────────────────────────────────────────────────────────────────────── */
/**
 * Wire frame length (NO START/STOP encoding):
 *  - 14 bytes payload + 1 byte CRC8 = 15 bytes total
 *
 * Payload layout (indexes):
 *  0  version (u8)
 *  1  bankPower_hi
 *  2  bankPower_lo
 *  3  bankNo (u8)
 *  3  bankHealth (u8)
 *  5  contactorsMask_hi
 *  6  contactorsMask_lo
 *  7  errContactors_hi
 *  8  errContactors_lo
 *  9  errFans_hi
 *  10 errFans_lo
 *  11 errThermals_hi
 *  12 errThermals_lo
 *  13 otherErrors (u8)
 *  14 crc8 (u8)
 */
export const LB_FRAME_LEN = 15;
//export const LB_START = 0x01;
//export const LB_STOP = 0x00;

// ------ CRC ------
export const CRC8_TABLE: number[] = [
   0, 94, 188, 226, 97, 63, 221, 131, 194, 156, 126, 32, 163, 253, 31, 65,
   157, 195, 33, 127, 252, 162, 64, 30, 95, 1, 227, 189, 62, 96, 130, 220,
   35, 125, 159, 193, 66, 28, 254, 160, 225, 191, 93, 3, 128, 222, 60, 98,
   190, 224, 2, 92, 223, 129, 99, 61, 124, 34, 192, 158, 29, 67, 161, 255,
   70, 24, 250, 164, 39, 121, 155, 197, 132, 218, 56, 102, 229, 187, 89, 7,
   219, 133, 103, 57, 186, 228, 6, 88, 25, 71, 165, 251, 120, 38, 196, 154,
   101, 59, 217, 135, 4, 90, 184, 230, 167, 249, 27, 69, 198, 152, 122, 36,
   248, 166, 68, 26, 153, 199, 37, 123, 58, 100, 134, 216, 91, 5, 231, 185,
   140, 210, 48, 110, 237, 179, 81, 15, 78, 16, 242, 172, 47, 113, 147, 205,
   17, 79, 173, 243, 112, 46, 204, 146, 211, 141, 111, 49, 178, 236, 14, 80,
   175, 241, 19, 77, 206, 144, 114, 44, 109, 51, 209, 143, 12, 82, 176, 238,
   50, 108, 142, 208, 83, 13, 239, 177, 240, 174, 76, 18, 145, 207, 45, 115,
   202, 148, 118, 40, 171, 245, 23, 73, 8, 86, 180, 234, 105, 55, 213, 139,
   87, 9, 235, 181, 54, 104, 138, 212, 149, 203, 41, 119, 244, 170, 72, 22,
   233, 183, 85, 11, 136, 214, 52, 106, 43, 117, 151, 201, 74, 20, 246, 168,
   116, 42, 200, 150, 21, 75, 169, 247, 182, 232, 10, 84, 215, 137, 107, 53,
];



/* ──────────────────────────────────────────────────────────────────────────────
   Load bank frames/status
────────────────────────────────────────────────────────────────────────────── */
// ------ CONNECTION ------
export type Roundtrip = {
   sent_bytes: number[];
   recv_bytes: number[];
   sent_hex: string;
   recv_hex: string;
   sent_hex_dump: string;
   recv_hex_dump: string;
   sent_ascii: string;
   recv_ascii: string;
   sent_encoded_msg: string;
   recv_encoded_msg: string;
};
export type Probe = {
   connected: boolean;
   hwId?: string;
   serial?: string;
   portName?: string;
};
export type LoadBankProbe =
   | { connected: false }
   | {
         connected: true;
         portName: string;
         status: LoadBankStatus;
         bank_power: number;
         bank_no: number;
         bank_health: number;
      };

export type SerialPortInfo = {
   portName: string;
   portType: string;
   vId?: Uint16Array;
   pId?: Uint16Array;
   serialNumber?: string;
   manufacturer?:  string;
   product?: string;
};

export type LoadBankHealth = {
   portName: string;
   online: boolean;
   lastSeenMs: number;
   reason?: string | null;
};

// new stuff - reflects rust
export type SerialRxChunk = {
   portName: string;
   bytes: number[];
   hex: Uint8Array;
};
export type SerialTxChunk = {
   portName: string;
   bytes: number[];
   hex: Uint8Array;
};


export type LoadBankFrame = {
   version: number;  
   bankPower: number;   
   bankNo: number;     
   
   bankHealth: number;

   contactorsMask: number; 
   errContactors: number;
   errFans: number;
   errThermals: number;
   otherErrors: number;   
};

export type LoadBankStatus = LoadBankFrame & {
   portName: string;
   rawFrameHex?: string;
};
export type LoadBankLive = {
   portName: string | null;
   status: LoadBankStatus | null;
   health: LoadBankHealth | null;
   online: boolean;
};



// ------ PROTOCOL CONFIGS ------
export type Baud = 9600|19200|38400|57600|115200|230400|460800|921600;
export interface SerialParams {
   port: string;
   baudRate: Baud;
   dataBits: 7|8;
   stopBits: 1|2;
   parity: 'none'|'even'|'odd';
   rtscts: boolean;
   xon?: boolean;
   xoff?: boolean;
   readTimeoutMs?: number;
   writeTimeoutMs?: number;
}
export enum CrcKind { 
   CRC8='CRC8', 
   CRC16='CRC16' 
}
export interface FrameConfig {
   sof: number;
   esc?: number|null;
   eof?: number|null;
   useCrc: CrcKind;
   littleEndian: boolean;
   maxPayload: number;
}
export enum MsgId { 
   PING=0x01, 
   PONG=0x02,
   
   ACK=0x06, 
   NACK=0x15, 

   MEASUREMENTS=0x10, 
   SET_SETPOINT=0x20, 
   INTERLOCKS=0x30
}
export interface MeasurementChannel { 
   name:string; 
   value:number; 
   unit:Unit; 
   ts?:string 
}
export interface AckFrame { 
   id:MsgId.ACK; 
   seq:number }

export interface NackFrame { 
   id:MsgId.NACK; 
   seq:number; 
   code:number; 
   detail?:string 
}
export interface PongFrame { 
   id:MsgId.PONG; 
   seq:number 
}
export interface MeasurementsFrame { 
   id:MsgId.MEASUREMENTS; 
   seq:number; 
   channels:MeasurementChannel[] 
}
export type DeviceFrame = AckFrame|NackFrame|PongFrame|MeasurementsFrame;

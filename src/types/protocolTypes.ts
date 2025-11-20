import { Unit } from "./checklistTypes";

// Connection Params
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
export enum CrcKind { CRC8='CRC8', CRC16='CRC16' }
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
   INTERLOCKS=0x30 }
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


/*
export interface Dut { 
   prodName:string; 
   brand:string; 
   series?:string; 
   serialno?:string; 
   processes:Process[]; 
   ratedCurrent?:RatedCurrent; 
   format?:string; 
   origin:DeviceOrigin 
}
*/

// Multimeter
export interface MultimeterPoint { 
   key:string; 
   value:number; 
   unit:Unit; //|string 
   ts?:string 
}
export interface MultimeterReading { 
   _id?:string;
   dutSerial?:string; 
   dutRef?:string; 
   fileSource?:{ 
      path?:string; 
      hash?:string; 
      parsedAt?:string 
   }; 
   points:MultimeterPoint[]; 
   operator?:string; 
   station?:string; 
   createdAt?:string; 
   notes?:string 
}

// API
export type ApiOk<T>={ 
   ok:true; 
   data:T 
};
export type ApiErr={ 
   ok:false; 
   error:string 
};
export type ApiResponse<T>=ApiOk<T>|ApiErr;
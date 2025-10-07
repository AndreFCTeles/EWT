// USER SETTINGS
export const LS_LAST             = 'ewt_lastUsername';   // last username (conveniência)
export const LS_REMEMBER         = 'ewt_rememberMe';     // '1' | '0'  (remember username)
export const LS_SAVED            = 'ewt_savedUsername';  // username remembered
export const LS_KEEP             = 'ewt_persistLogin';   // '1' = keep logged-in
export const LS_AUTH             = 'ewt_auth';           // JSON blob - saved creds
export const LS_THEME            = 'ewt_colorScheme';    // 'light' | 'dark'
export const LS_VIEW             = 'ewt_uiView';         // 'basic' | 'advanced' (caso queira guardar)
export type UIVIEW               = 'basic' | 'advanced'


export const MANUAL_TOGGLE = true;


// AUTHENTICATION
export type Role                 = 'not_logged' | 'user' | 'admin' | 'superadmin';
export type Status               = 'ativo' | 'desativado' | 'bloqueado';
export type CredentialSafe = {
   _id: string;
   nome: string;
   username: string;
   email?: string | null;
   active: boolean;
   status: Status;
   roles: Role;                                          // global role
   apps: Record<string, { roles?: Role }>;               // sanitized (no appPass)
};
export type SavedAuth = {
   username: string;                                     // username
   password: string;                                     // appPass
   app: string;                                          // APP_NAME
};




//CLOCK
export interface ProcessCardProps {
   title: string;
   process: {
      id: string,
      name: string,
      run_time: string,
      memory: string,
   };
}



// --- CONTENT ---

// Tolerances
export type TolAbs = { 
   kind: 'abs'; 
   abs: number 
};
export type TolPct = { 
   kind: 'pct'; 
   pct: number 
};
export type TolCombo = { 
   kind: 'combo'; 
   abs: number; 
   pct: number 
};
export type TolPiece = { 
   kind: 'piecewise'; 
   rules: Array<{ 
      upTo: number; 
      tol: Exclude<Tol, {kind:'piecewise'}> 
   }> 
};
export type Tol = TolAbs | TolPct | TolCombo | TolPiece;


// Dut
export type Probe = {
   connected: boolean;
   hwId?: string;
   serial?: string;
}

export type Processes            = "MIG" | "MMA" | "TIG";
export type AvailablePowers      = 300 | 400 | 500 | 600;
export type DeviceOrigin         = 'db' | 'manual';
export type Brand = { id: string; name: string };
export type Range = { min: number; max: number };

export const STUB_BRANDS: Brand[] = [
   { id: 'b-elec', name: 'Electrex' },
   { id: 'b-ewm',  name: 'EWM' },
   { id: 'b-esab', name: 'ESAB' },
   { id: 'b-fron', name: 'Fronius' },
   { id: 'b-kemp', name: 'Kemppi' },
];
export type STUBBIER_BRANDS_TYPE = 'Electrex' | 'EWM' | 'ESAB' | 'Fronius' | 'Kemppi' | '';
export const STUBBIER_BRANDS: STUBBIER_BRANDS_TYPE[] = ['Electrex','EWM','ESAB','Fronius','Kemppi'];



// States
export type InterlockState = { // Abstraction. TODO: Replace with real I/O (WebUSB/HID/Tauri IPC)
   enclosureClosed: boolean;
   eStopReleased: boolean;
   gasOk?: boolean;
   coolantOk?: boolean;
   mainsOk?: boolean;
   polarityContinuity?: 'ok' | 'reversed' | 'open' | 'unknown';
};
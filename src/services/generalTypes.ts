export const DB_HOST             = 'http://192.168.0.12:8080';
export const APP_NAME            = 'Banca';
export type UIVIEW               = 'basic' | 'advanced'

// USER SETTINGS
export const LS_LAST             = 'ewt_lastUsername';   // last username (conveniência)
export const LS_REMEMBER         = 'ewt_rememberMe';     // '1' | '0'  (remember username)
export const LS_SAVED            = 'ewt_savedUsername';  // username remembered
export const LS_KEEP             = 'ewt_persistLogin';   // '1' = keep logged-in
export const LS_AUTH             = 'ewt_auth';           // JSON blob - saved creds
export const LS_THEME            = 'ewt_colorScheme';    // 'light' | 'dark'
export const LS_VIEW             = 'ewt_uiView';         // 'basic' | 'advanced' (caso queira guardar)

export type MainComponents       = "process" | "login" | 'wait';
export type Processes            = "MIG" | "MMA" | "TIG";
export type AvailablePowers      = 300 | 400 | 500 | 600;
export type DeviceOrigin         = 'db' | 'manual';
export type Brand = { id: string; name: string };

export const STUB_BRANDS: Brand[] = [
   { id: 'b-elec', name: 'Electrex' },
   { id: 'b-ewm',  name: 'EWM' },
   { id: 'b-esab', name: 'ESAB' },
   { id: 'b-fron', name: 'Fronius' },
   { id: 'b-kemp', name: 'Kemppi' },
];
export type STUBBIER_BRANDS_TYPE = 'Electrex' | 'EWM' | 'ESAB' | 'Fronius' | 'Kemppi' | '';
export const BRANDS: STUBBIER_BRANDS_TYPE[] = ['Electrex','EWM','ESAB','Fronius','Kemppi'];




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
export const DB_HOST             = 'http://192.168.0.12:8080';
export const APP_NAME            = 'Banca';

// USER SETTINGS
export const LS_LAST             = 'jrm_lastUsername';   // last username (conveniência)
export const LS_REMEMBER         = 'jrm_rememberMe';     // '1' | '0'  (remember username)
export const LS_SAVED            = 'jrm_savedUsername';  // username remembered
export const LS_KEEP             = 'jrm_persistLogin';   // '1' = keep logged-in
export const LS_AUTH             = 'jrm_auth';           // JSON blob - saved creds
export const LS_THEME            = 'jrm_colorScheme';    // 'light' | 'dark' if not using Mantine’s manager)

// AUTHENTICATION
export type Role                 = 'user' | 'admin' | 'superadmin';
export type Status               = 'ativo' | 'desativado' | 'bloqueado';
export type CredentialSafe = {
   _id: string;
   nome: string;
   username: string;
   email?: string | null;
   active: boolean;
   status: Status;
   roles: Role | null;                                   // global role
   apps: Record<string, { roles?: Role }>;               // sanitized (no appPass)
};
export type SavedAuth = {
   username: string;                                     // username
   password: string;                                     // appPass
   app: string;                                          // APP_NAME
};


export type mainComponents = "process" | "login" | 'wait';
export type Processes = "MIG" | "MMA" | "TIG";

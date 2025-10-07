import { CredentialSafe } from "@/types/generalTypes";
import { API_URL } from "@/lib/config";

const login = async(username: string, password: string, appName = 'JRMFerias') => {
   const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, appName }),
   });
   console.log("got login response");
   console.log(res);
   const json = await res.json();
   if (!res.ok) { throw new Error(json?.error || 'Falha no login'); }
   return json as { user: CredentialSafe };
}

export default login;
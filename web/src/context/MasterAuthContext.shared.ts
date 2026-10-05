import { createContext,useContext } from 'react';


export interface MasterAdmin {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'SUPPORT' | 'FINANCE' | 'AUDITOR';
}


export interface MasterAuthState {
  admin: MasterAdmin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}


export const MasterAuthContext = createContext<MasterAuthState | null>(null);


export function useMasterAuth(): MasterAuthState {
  const ctx = useContext(MasterAuthContext);
  if (!ctx) throw new Error('useMasterAuth debe usarse dentro de <MasterAuthProvider>');
  return ctx;
}

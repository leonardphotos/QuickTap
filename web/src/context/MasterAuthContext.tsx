import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { clearMasterToken, getMasterToken, masterApi, setMasterToken } from '../api/client';

interface MasterAdmin {
  id: string;
  name: string;
  email: string;
}

interface MasterAuthState {
  admin: MasterAdmin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const MasterAuthContext = createContext<MasterAuthState | null>(null);

export function MasterAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<MasterAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getMasterToken()) {
      setLoading(false);
      return;
    }
    masterApi
      .get('/master-auth/me')
      .then((res) => setAdmin(res.data.data))
      .catch(() => {
        clearMasterToken();
        setAdmin(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { data } = await masterApi.post('/master-auth/login', { email, password });
    setMasterToken(data.data.token);
    setAdmin(data.data.admin);
  }

  function logout() {
    clearMasterToken();
    setAdmin(null);
  }

  return <MasterAuthContext.Provider value={{ admin, loading, login, logout }}>{children}</MasterAuthContext.Provider>;
}

export function useMasterAuth(): MasterAuthState {
  const ctx = useContext(MasterAuthContext);
  if (!ctx) throw new Error('useMasterAuth debe usarse dentro de <MasterAuthProvider>');
  return ctx;
}

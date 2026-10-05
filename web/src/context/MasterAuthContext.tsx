import type { ReactNode } from 'react';
import { useEffect,useState } from 'react';
import { clearMasterToken,getMasterToken,masterApi,setMasterToken } from '../api/client';
import { type MasterAdmin,MasterAuthContext } from './MasterAuthContext.shared';

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

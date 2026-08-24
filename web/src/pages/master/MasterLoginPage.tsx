import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMasterAuth } from '../../context/MasterAuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import AuthLayout from '../admin/AuthLayout';
import { Field } from '../admin/LoginPage';
import { useMasterTheme } from './useMasterTheme';

export default function MasterLoginPage() {
  useMasterTheme();
  const { login } = useMasterAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/master');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Dashboard de administrador">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Contraseña" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={loading} className="mt-2 disabled:opacity-50">
          {loading ? 'Ingresando…' : 'Iniciar sesión'}
        </TextureButton>
      </form>
    </AuthLayout>
  );
}

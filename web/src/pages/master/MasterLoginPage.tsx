import './master-theme.css';
import { TextureButton } from '@/components/ui/texture-button';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMasterAuth } from '../../context/MasterAuthContext.shared';
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
    <main className="master-ui flex min-h-dvh items-center justify-center bg-[#f6f7f9] px-5 py-12">
      <section className="w-full max-w-sm rounded-3xl border border-slate-200/70 bg-white p-7 shadow-sm">
      <img src="/logo/quicktap-logo.png" alt="QuickTap" className="mb-8 h-8 w-auto" />
      <p className="mb-2 font-medium uppercase tracking-widest text-brand-500 text-xs">Centro de control</p>
      <h1 className="mb-2 text-2xl font-semibold">Bienvenido al máster</h1>
      <p className="mb-7 text-gray-900 text-base">Ingresa con tu cuenta de administración.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Contraseña" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-red-600 text-base">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={loading} className="mt-2 w-full disabled:opacity-50">
          {loading ? 'Ingresando…' : 'Iniciar sesión'}
        </TextureButton>
      </form>
    </section></main>
  );
}

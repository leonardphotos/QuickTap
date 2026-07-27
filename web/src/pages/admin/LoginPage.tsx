import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { clearRememberedEmail, getRememberedEmail, getStoredSlug, setRememberedEmail } from '../../api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { PasswordInput } from '@/components/ui/password-input';
import AuthLayout from './AuthLayout';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const rememberedEmail = getRememberedEmail();
  const [email, setEmail] = useState(rememberedEmail ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(rememberedEmail !== null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Si este navegador ya conoce el restaurante (login previo) se manda
      // como atajo; si no, el backend resuelve la cuenta por el correo.
      await login(email, password, getStoredSlug() ?? undefined);
      if (remember) setRememberedEmail(email);
      else clearRememberedEmail();
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Ingresa a tu Dashboard"
      footer={
        <p className="text-sm text-brand-950/60 font-light">
          ¿No tienes cuenta?{' '}
          <Link to="/empezar" className="text-brand-500 font-medium">
            Regístrate
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} name="email" autoComplete="username" />
        <Field
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
          name="password"
          autoComplete="current-password"
        />
        <div className="flex items-center justify-between -mt-2">
          <label className="flex items-center gap-1.5 text-sm text-brand-950/70">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Recordarme
          </label>
          <Link to="/admin/forgot-password" className="text-sm text-brand-500 font-medium">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={loading} className="mt-2 disabled:opacity-50">
          {loading ? 'Ingresando…' : 'Iniciar sesión'}
        </TextureButton>
      </form>
    </AuthLayout>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  name,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  name?: string;
  autoComplete?: string;
}) {
  const inputClassName =
    'mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500';

  return (
    <label className="block text-sm">
      <span className="text-brand-950/70">{label}</span>
      {type === 'password' ? (
        <PasswordInput
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
          name={name}
          autoComplete={autoComplete}
          required
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
          name={name}
          autoComplete={autoComplete}
          required
        />
      )}
    </label>
  );
}

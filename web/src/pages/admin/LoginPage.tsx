import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../context/AuthContext';
import { clearRememberedEmail, getRememberedEmail, getStoredSlug, setRememberedEmail } from '../../api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { PasswordInput } from '@/components/ui/password-input';
import AuthLayout from './AuthLayout';

export default function LoginPage() {
  const { login, loginWithGoogle, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Con el acceso directo instalado (PWA), la app abre directo en /admin/login —
  // si el navegador ya tiene sesión, salta la pantalla de login en vez de pedirla de nuevo.
  useEffect(() => {
    if (!authLoading && user) navigate('/admin', { replace: true });
  }, [authLoading, user, navigate]);
  const rememberedEmail = getRememberedEmail();
  const [email, setEmail] = useState(rememberedEmail ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(rememberedEmail !== null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  async function onGoogleSuccess(credential: string) {
    setGoogleLoading(true);
    setError(null);
    try {
      const result = await loginWithGoogle(credential, getStoredSlug() ?? undefined);
      if (result.needsRegistration) {
        // Sin cuenta todavía: manda los datos ya verificados de Google al registro para
        // que solo falte pedir nombre del restaurante + slug (nunca email/contraseña).
        navigate('/empezar', { state: { googleCredential: credential, googleEmail: result.email, googleName: result.name } });
        return;
      }
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar sesión con Google.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthLayout
      footer={
        <div className="space-y-4">
          <p className="text-sm text-brand-950/60 font-light">
            ¿No tienes cuenta?{' '}
            <Link to="/empezar" className="text-brand-500 font-medium">
              Regístrate
            </Link>
          </p>

          {/* Google va al final, después del registro: el correo y la contraseña son la vía
              normal de quien ya tiene cuenta, y arriba le robaban el primer lugar. */}
          <div>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-brand-950/10" />
              <span className="text-xs text-brand-950/40">o entra con</span>
              <div className="h-px flex-1 bg-brand-950/10" />
            </div>
            <div className="mt-3 flex justify-center">
              <GoogleLogin
                onSuccess={(cred) => cred.credential && onGoogleSuccess(cred.credential)}
                onError={() => setError('No se pudo iniciar sesión con Google.')}
                text="signin_with"
              />
            </div>
            {googleLoading && <p className="mt-1 text-xs text-brand-950/50">Ingresando…</p>}
          </div>
        </div>
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
  onBlur,
  type = 'text',
  placeholder,
  name,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Se dispara al salir del campo — lo usa el registro para guardar el avance del embudo. */
  onBlur?: () => void;
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
          onBlur={onBlur}
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
          onBlur={onBlur}
          className={inputClassName}
          name={name}
          autoComplete={autoComplete}
          required
        />
      )}
    </label>
  );
}

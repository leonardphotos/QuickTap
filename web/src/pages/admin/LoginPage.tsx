import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../context/AuthContext';
import { clearRememberedEmail, getRememberedEmail, getStoredSlug, setRememberedEmail } from '../../api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { PasswordInput } from '@/components/ui/password-input';
import AuthLayout from './AuthLayout';
import { WaiterProfilePicker } from '@/components/admin/WaiterProfilePicker';

export default function LoginPage() {
  const { login, loginWithGoogle, switchableWaiters, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  // Segundo inicio de sesión: si este restaurante ya tiene meseros con PIN configurado, un
  // login normal (correo/clave) no entra directo al panel — primero pregunta de quién es la
  // tablet, estilo Netflix. "Seguir como {tú}" en la cuadrícula es la salida para quien de
  // verdad quería entrar con su propia cuenta (dueño/admin en su propio dispositivo).
  const [showPicker, setShowPicker] = useState(false);
  // login()/loginWithGoogle() dejan `user` seteado en cuanto responde el POST — el efecto de
  // abajo (auto-saltar el login si ya hay sesión) reacciona a ESE mismo cambio y mandaba a
  // /admin antes de que afterLogin() alcanzara a preguntar si hay que mostrar la cuadrícula.
  // Este ref frena al efecto mientras esa pregunta está en vuelo.
  const resolviendoLoginRef = useRef(false);

  async function afterLogin() {
    try {
      const waiters = await switchableWaiters();
      if (waiters.length > 0) {
        setShowPicker(true);
        return;
      }
    } catch {
      // Sin lista (fallo de red, restaurante recién creado, etc.): no bloquea el login normal.
    } finally {
      resolviendoLoginRef.current = false;
    }
    navigate('/admin');
  }

  // Con el acceso directo instalado (PWA), la app abre directo en /admin/login —
  // si el navegador ya tiene sesión, salta la pantalla de login en vez de pedirla de nuevo.
  useEffect(() => {
    if (!authLoading && user && !resolviendoLoginRef.current && !showPicker) navigate('/admin', { replace: true });
  }, [authLoading, user, navigate, showPicker]);
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
    resolviendoLoginRef.current = true;
    try {
      // Si este navegador ya conoce el restaurante (login previo) se manda
      // como atajo; si no, el backend resuelve la cuenta por el correo.
      await login(email, password, getStoredSlug() ?? undefined);
      if (remember) setRememberedEmail(email);
      else clearRememberedEmail();
      await afterLogin();
    } catch (err: any) {
      resolviendoLoginRef.current = false;
      setError(err.response?.data?.error ?? 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSuccess(credential: string) {
    setGoogleLoading(true);
    setError(null);
    resolviendoLoginRef.current = true;
    try {
      const result = await loginWithGoogle(credential, getStoredSlug() ?? undefined);
      if (result.needsRegistration) {
        // Sin cuenta todavía: manda los datos ya verificados de Google al registro para
        // que solo falte pedir nombre del restaurante + slug (nunca email/contraseña).
        resolviendoLoginRef.current = false;
        navigate('/empezar', { state: { googleCredential: credential, googleEmail: result.email, googleName: result.name } });
        return;
      }
      await afterLogin();
    } catch (err: any) {
      resolviendoLoginRef.current = false;
      setError(err.response?.data?.error ?? 'No se pudo iniciar sesión con Google.');
    } finally {
      setGoogleLoading(false);
    }
  }

  if (showPicker) {
    return <WaiterProfilePicker onSkip={() => navigate('/admin')} />;
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

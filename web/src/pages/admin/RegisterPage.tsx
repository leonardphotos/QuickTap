import RegistrationFlow, { type RegistrationFields } from '@/components/billing/RegistrationFlow';
import { isCommercialPlan, type CommercialPlan } from '@/utils/commercial-plans';
import { funnelSessionId,trackFunnel } from '@/utils/registrationFunnel';
import { GoogleLogin } from '@react-oauth/google';
import type { FormEvent } from 'react';
import { useEffect,useRef,useState } from 'react';
import { useLocation,useNavigate,useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.shared';
import type { Currency } from '../../types';

interface GoogleSignupState {
  googleCredential: string;
  googleEmail: string;
  googleName: string;
}

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Los enlaces viejos de otras verticales pueden seguir circulando, pero la captación pública
  // está enfocada en restaurantes. Se limpian sin borrar esos productos ni sus cuentas.
  const requestedBusinessType = searchParams.get('businessType');
  const hiddenVerticalRequested = ['shop', 'club', 'office', 'warehouse'].includes(requestedBusinessType ?? '');
  const publicBusinessType = hiddenVerticalRequested ? null : requestedBusinessType;
  const isShop = publicBusinessType === 'shop';
  const isClub = publicBusinessType === 'club';
  const isOffice = publicBusinessType === 'office';
  const shopRubroId = searchParams.get('rubro');
  // Viene de "Continuar con Google" en /admin/login sin cuenta todavía (ver LoginPage.tsx):
  // el email/nombre ya están verificados por Google, así que el form ya no los pide.
  const [googleSignup, setGoogleSignup] = useState<GoogleSignupState | null>(
    (location.state as GoogleSignupState | null) ?? null,
  );
  const [restaurantName, setRestaurantName] = useState('');
  const [slug, setSlug] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [baseCurrency, setBaseCurrency] = useState<Currency>('USD');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<CommercialPlan>(() => { const requested = searchParams.get('plan'); return isCommercialPlan(requested) ? requested : 'ESSENTIAL'; });
  const submitting = useRef(false);

  useEffect(() => {
    if (!hiddenVerticalRequested) return;
    const restaurantParams = new URLSearchParams(searchParams);
    restaurantParams.delete('businessType');
    restaurantParams.delete('rubro');
    if (['SHOP', 'ELITE_SHOP', 'CLUB', 'OFFICE'].includes(restaurantParams.get('plan') ?? '')) {
      restaurantParams.delete('plan');
    }
    const query = restaurantParams.toString();
    navigate(`/admin/register${query ? `?${query}` : ''}`, { replace: true, state: location.state });
  }, [hiddenVerticalRequested, location.state, navigate, searchParams]);

  // Solo la etapa y el tipo de negocio; nunca el contenido del formulario.
  useEffect(() => {
    trackFunnel({
      stage: 'FORM',
      businessType: isShop ? 'shop' : isClub ? 'club' : isOffice ? 'office' : 'restaurant',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGoogleSuccess(credential: string) {
    setError(null);
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    // Reusa exactamente la misma verificación que /admin/login: si esta cuenta de Google
    // ya existe (ej. abrió /empezar por error) entra directo en vez de pedirle de nuevo
    // los datos del restaurante.
    try {
      const result = await loginWithGoogle(credential);
      if (result.needsRegistration) {
        setGoogleSignup({ googleCredential: credential, googleEmail: result.email, googleName: result.name });
      } else {
        navigate('/admin');
      }
    } catch (err: any) {
      setGoogleSignup(null);
      setError(err.response?.data?.error ?? 'No se pudo continuar con Google.');
    } finally { submitting.current = false; setLoading(false); }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      if (googleSignup) {
        const result = await loginWithGoogle(googleSignup.googleCredential, undefined, {
          restaurantName,
          slug,
          whatsappPhone: whatsappPhone || undefined,
          baseCurrency,
          businessType: isShop ? 'SHOP' : isClub ? 'SPORTS_CLUB' : isOffice ? 'ADMIN_OFFICE' : 'RESTAURANT',
          shopRubro: isShop ? (shopRubroId ?? undefined) : undefined,
          funnelSessionId: funnelSessionId(),
          termsAccepted: true,
        });
        if (result.needsRegistration) { setError('Revisa tus datos e intenta crear la cuenta de nuevo.'); return; }
      } else {
        await register({
          restaurantName,
          slug,
          whatsappPhone: whatsappPhone || undefined,
          baseCurrency,
          ownerName,
          email,
          password,
          businessType: isShop ? 'SHOP' : isClub ? 'SPORTS_CLUB' : isOffice ? 'ADMIN_OFFICE' : 'RESTAURANT',
          shopRubro: isShop ? (shopRubroId ?? undefined) : undefined,
          funnelSessionId: funnelSessionId(),
          termsAccepted: true,
        });
      }
      // Si venía de "Elegir plan" en la landing, lo mandamos directo a pagar ese plan.
      const billingParams = new URLSearchParams(searchParams);
      billingParams.set('plan', plan);
      billingParams.set('cycle', 'MONTHLY');
      billingParams.delete('businessType');
      billingParams.delete('rubro');
      navigate(`/admin/billing?${billingParams.toString()}`);
    } catch (err: any) {
      const mensaje = err.response?.data?.error ?? 'No se pudo registrar el restaurante.';
      setError(mensaje);
      // Queda registrado con qué se topó: un "ese enlace ya está en uso" repetido en la lista
      // dice que el problema es el formulario, no el interés del cliente.
      trackFunnel({ stage: 'FORM' });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const setters: Record<keyof RegistrationFields, (value: string) => void> = {
    restaurantName: setRestaurantName,
    slug: value => setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, '-')),
    whatsappPhone: setWhatsappPhone,
    baseCurrency: value => setBaseCurrency(value as Currency),
    ownerName: setOwnerName, email: setEmail, password: setPassword,
  };
  return <RegistrationFlow
    values={{ restaurantName, slug, whatsappPhone, baseCurrency, ownerName, email, password }}
    onChange={(key, value) => { setters[key](value); setError(null); }}
    plan={plan} onPlanChange={setPlan} google={googleSignup}
    onClearGoogle={() => { setGoogleSignup(null); setError(null); }}
    googleButton={<GoogleLogin onSuccess={cred => cred.credential && onGoogleSuccess(cred.credential)} onError={() => setError('No se pudo continuar con Google.')} text="signup_with"/>}
    onSubmit={onSubmit} loading={loading} error={error}
  />;
}

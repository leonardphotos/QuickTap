import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Field } from './LoginPage';
import AuthLayout from './AuthLayout';
import type { Currency } from '../../types';
import { TextureButton } from '@/components/ui/texture-button';
import { WhatsappPhoneInput } from '@/components/ui/whatsapp-phone-input';
import { getShopRubro } from '@/data/shopRubros';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Presencia de estos dos params = viene del flujo "Locales Comerciales" (ver StartRegisterPage
  // -> ShopRubroPage). Sin ellos, el registro se comporta exactamente igual que siempre.
  const isShop = searchParams.get('businessType') === 'shop';
  const shopRubroId = searchParams.get('rubro');
  const shopRubro = isShop ? getShopRubro(shopRubroId) : undefined;
  const [restaurantName, setRestaurantName] = useState('');
  const [slug, setSlug] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [baseCurrency, setBaseCurrency] = useState<Currency>('USD');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({
        restaurantName,
        slug,
        whatsappPhone: whatsappPhone || undefined,
        baseCurrency,
        ownerName,
        email,
        password,
        businessType: isShop ? 'SHOP' : 'RESTAURANT',
        shopRubro: isShop ? (shopRubroId ?? undefined) : undefined,
      });
      // Si venía de "Elegir plan" en la landing, lo mandamos directo a pagar ese plan.
      const plan = searchParams.get('plan');
      navigate(plan ? `/admin/billing?${searchParams.toString()}` : '/admin');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el restaurante.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={isShop ? 'Registra tu local comercial' : 'Registra tu local'}
      footer={
        <p className="text-sm text-brand-950/60 font-light">
          ¿Ya tienes cuenta?{' '}
          <Link to="/admin/login" className="text-brand-500 font-medium">
            Ingresa
          </Link>
        </p>
      }
    >
      {isShop && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-brand-500/10 px-4 py-3">
          <span className="text-sm font-medium text-brand-950">
            {shopRubro ? `${shopRubro.emoji} ${shopRubro.label}` : 'Rubro no seleccionado'}
          </span>
          <Link
            to={`/admin/register/rubro?${searchParams.toString()}`}
            className="shrink-0 text-xs font-semibold text-brand-500 hover:underline"
          >
            Cambiar
          </Link>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label={isShop ? 'Nombre del negocio' : 'Nombre del restaurante'}
          value={restaurantName}
          onChange={setRestaurantName}
        />
        <Field
          label="Slug (URL pública)"
          value={slug}
          onChange={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          placeholder="mi-restaurante"
        />
        <label className="block text-sm">
          <span className="text-brand-950/70">WhatsApp</span>
          <div className="mt-1">
            <WhatsappPhoneInput value={whatsappPhone} onChange={setWhatsappPhone} />
          </div>
          <span className="text-xs text-brand-950/40 font-light">
            Elige tu país y escribe el número local; el código se agrega automáticamente.
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-brand-950/70">¿En qué moneda colocas tus precios?</span>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value as Currency)}
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          >
            <option value="USD">Dólares ($)</option>
            <option value="EUR">Euros (€)</option>
          </select>
          <span className="text-xs text-brand-950/40 font-light">
            La conversión a Bs para tus clientes se calcula sola con la tasa BCV.
          </span>
        </label>
        <Field label="Tu nombre" value={ownerName} onChange={setOwnerName} />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Contraseña" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={loading} className="mt-2 disabled:opacity-50">
          {loading ? 'Creando…' : 'Crear cuenta'}
        </TextureButton>
      </form>
    </AuthLayout>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Field } from './LoginPage';
import AuthLayout from './AuthLayout';
import type { Currency } from '../../types';
import { TextureButton } from '@/components/ui/texture-button';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
      title="Registra tu local"
      footer={
        <p className="text-sm text-brand-950/60 font-light">
          ¿Ya tienes cuenta?{' '}
          <Link to="/admin/login" className="text-brand-500 font-medium">
            Ingresa
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nombre del restaurante" value={restaurantName} onChange={setRestaurantName} />
        <Field
          label="Slug (URL pública)"
          value={slug}
          onChange={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          placeholder="mi-restaurante"
        />
        <Field label="WhatsApp (con código de país)" value={whatsappPhone} onChange={setWhatsappPhone} placeholder="584141234567" />
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

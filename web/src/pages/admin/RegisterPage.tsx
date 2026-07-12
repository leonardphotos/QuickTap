import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Field } from './LoginPage';
import type { Currency } from '../../types';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
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
      navigate('/admin/kitchen');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el restaurante.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-2xl border w-full max-w-sm space-y-3">
        <h1 className="text-xl font-bold text-gray-900">Crea tu restaurante</h1>
        <Field label="Nombre del restaurante" value={restaurantName} onChange={setRestaurantName} />
        <Field
          label="Slug (URL pública)"
          value={slug}
          onChange={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          placeholder="mi-restaurante"
        />
        <Field label="WhatsApp (con código de país)" value={whatsappPhone} onChange={setWhatsappPhone} placeholder="584141234567" />
        <label className="block text-sm">
          <span className="text-gray-600">¿En qué moneda colocas tus precios?</span>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value as Currency)}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            <option value="USD">Dólares ($)</option>
            <option value="EUR">Euros (€)</option>
          </select>
          <span className="text-xs text-gray-400">
            La conversión a Bs para tus clientes se calcula sola con la tasa BCV.
          </span>
        </label>
        <Field label="Tu nombre" value={ownerName} onChange={setOwnerName} />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Contraseña" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={loading}
          className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium disabled:opacity-50"
        >
          {loading ? 'Creando…' : 'Crear cuenta'}
        </button>
        <p className="text-sm text-center text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/admin/login" className="text-gray-900 font-medium">
            Ingresa
          </Link>
        </p>
      </form>
    </div>
  );
}

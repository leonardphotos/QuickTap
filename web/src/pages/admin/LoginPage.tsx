import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(slug, email, password);
      navigate('/admin/kitchen');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-950/[0.03] px-4">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-2xl border border-brand-950/10 w-full max-w-sm space-y-3">
        <h1 className="text-xl font-semibold text-brand-950">Ingresar a QuickTap</h1>
        <Field label="Slug del restaurante" value={slug} onChange={setSlug} placeholder="mi-restaurante" />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Contraseña" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={loading}
          className="w-full bg-brand-500 text-white rounded-lg py-2 font-medium hover:bg-brand-800 disabled:opacity-50"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p className="text-sm text-center text-brand-950/60 font-light">
          ¿No tienes cuenta?{' '}
          <Link to="/admin/register" className="text-brand-500 font-medium">
            Regístrate
          </Link>
        </p>
      </form>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-brand-950/70">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
        required
      />
    </label>
  );
}

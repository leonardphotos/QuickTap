import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { PasswordInput } from '@/components/ui/password-input';
import { OtpInput } from '@/components/ui/otp-input';
import AuthLayout from './AuthLayout';
import { Field } from './LoginPage';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestCode() {
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo enviar el código.');
    } finally {
      setLoading(false);
    }
  }

  function sendCode(e: FormEvent) {
    e.preventDefault();
    requestCode();
  }

  async function confirmReset(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { email, code, newPassword });
      navigate('/admin/login');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'email') {
    return (
      <AuthLayout
        title="Recupera tu contraseña"
        footer={
          <Link to="/admin/login" className="text-sm text-brand-500 font-medium">
            Volver a iniciar sesión
          </Link>
        }
      >
        <form onSubmit={sendCode} className="space-y-4">
          <p className="text-sm text-brand-950/60 font-light -mt-2 mb-2">
            Escribe el correo de tu cuenta y te enviamos un código para restablecer la contraseña.
          </p>
          <Field label="Email" type="email" value={email} onChange={setEmail} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={loading} className="mt-2 disabled:opacity-50">
            {loading ? 'Enviando…' : 'Enviar código'}
          </TextureButton>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Escribe el código"
      footer={
        <Link to="/admin/login" className="text-sm text-brand-500 font-medium">
          Volver a iniciar sesión
        </Link>
      }
    >
      <motion.form
        onSubmit={confirmReset}
        className="space-y-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <p className="text-sm text-brand-950/60 font-light -mt-2 mb-2">
          Enviamos un código de 6 dígitos a <span className="font-medium text-brand-950">{email}</span>. Vence en 15 minutos.
        </p>
        <div className="block text-sm">
          <span className="text-brand-950/70">Código</span>
          <div className="mt-2">
            <OtpInput value={code} onChange={(v) => setCode(v.slice(0, 6))} autoFocus />
          </div>
        </div>
        <label className="block text-sm">
          <span className="text-brand-950/70">Nueva contraseña</span>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton
          variant="brand"
          size="default"
          disabled={loading || code.length !== 6}
          className="mt-2 disabled:opacity-50"
        >
          {loading ? 'Guardando…' : 'Cambiar contraseña'}
        </TextureButton>
        <button
          type="button"
          disabled={cooldown > 0 || loading}
          onClick={requestCode}
          className="w-full text-center text-sm text-brand-500 font-medium disabled:opacity-40"
        >
          {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
        </button>
      </motion.form>
    </AuthLayout>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { GradientWave } from '@/components/ui/gradient-wave';
import { TextureButton } from '@/components/ui/texture-button';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { PASS_LOGO_URL, PASS_NAME } from './passBrand';
import { setPassToken } from './passSession';

/**
 * Entrada a QuickTap Pass (quicktap.club/pass).
 *
 * Puerta aparte de las de negocio y plataforma: quien entra acá no tiene usuario en ningún
 * panel, es un comprador que quiere ver lo que debe. Se identifica con su teléfono y su cédula.
 */
export default function PassLoginPage() {
  useDocumentMeta(`${PASS_NAME} — Consulta tus compras`, 'Consulta tus compras, abonos y cuotas pendientes.');
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/public/pass/login', { phone, idNumber });
      setPassToken(res.data.data.token);
      navigate('/pass/mis-compras');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No pudimos entrar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#F6F9FC]">
      <GradientWave />
      {/* Máscara suave para que el formulario se lea encima de la onda. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#F6F9FC]/70 via-[#F6F9FC]/45 to-[#F6F9FC]/85" />

      <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-12">
        <img src={PASS_LOGO_URL} alt={PASS_NAME} className="h-11 w-auto" />
        <p className="mt-2 text-sm font-semibold tracking-[0.28em] text-brand-950/45 uppercase">Pass</p>

        <div className="mt-8 w-full max-w-sm rounded-[24px] border border-white/60 bg-white/85 p-6 shadow-[0_24px_64px_-28px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <h1 className="text-center text-xl font-bold text-brand-950">Consulta tus compras</h1>
          <p className="mt-1 text-center text-sm font-light text-brand-950/55">
            Mira cuánto llevas abonado y cuánto te falta.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-brand-950/60">Teléfono</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="0414-1234567"
                className="mt-1 w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-brand-950/60">Cédula <span className="font-light text-brand-950/40">(solo los números, sin la V)</span></span>
              <input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="12345678"
                className="mt-1 w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <TextureButton variant="brand" size="default" disabled={busy} className="disabled:opacity-50">
              {busy ? 'Entrando…' : 'Entrar'}
            </TextureButton>
          </form>

          <p className="mt-4 text-center text-[11px] font-light leading-snug text-brand-950/40">
            Usa el mismo teléfono con el que compraste. Si no reconoce tus datos, pídele al negocio
            que verifique tu cédula en su ficha de cliente.
          </p>
        </div>
      </div>
    </div>
  );
}

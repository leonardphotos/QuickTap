import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { WALLET_NAME, WALLET_WORDMARK_URL } from './walletBrand';
import { setWalletToken } from './walletSession';

/**
 * Entrada a QuickTap Wallet (quicktap.club/wallet).
 *
 * Puerta aparte de las de negocio y plataforma: quien entra acá no tiene usuario en ningún
 * panel, es un comprador que quiere ver lo que debe. Se identifica con su teléfono y su cédula.
 *
 * El carrusel de arriba existe porque casi nadie llega sabiendo qué es Pass: se entra por un
 * enlace que le pasó el negocio. Tres frases explican de qué se trata mientras el cliente
 * escribe, sin obligarlo a pasar por una bienvenida de varios toques — el formulario está
 * abajo desde el primer momento.
 */

const SLIDES = [
  {
    titulo: 'Tus compras,',
    resalte: 'en un solo lugar.',
    texto: 'Todo lo que llevas a crédito, junto y al día.',
  },
  {
    titulo: 'Mira cuánto',
    resalte: 'te falta.',
    texto: 'Tu saldo, tus cuotas y la fecha de cada pago, sin tener que preguntar.',
  },
  {
    titulo: 'Reporta tu abono',
    resalte: 'desde aquí.',
    texto: 'Paga, sube el comprobante y el negocio lo verifica.',
  },
];

const SLIDE_MS = 5000;

export default function WalletLoginPage() {
  useDocumentMeta(`${WALLET_NAME} — Consulta tus compras`, 'Consulta tus compras, abonos y cuotas pendientes.');
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  // Se detiene en cuanto el cliente elige un texto a mano: seguir rotándole el titular
  // debajo del dedo es de las cosas que más molestan de un carrusel.
  const [autoRota, setAutoRota] = useState(true);

  useEffect(() => {
    if (!autoRota) return;
    // Quien pidió menos movimiento se queda en el primer texto: un carrusel que gira solo
    // es justo el tipo de movimiento que esa preferencia busca evitar.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [autoRota]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/public/wallet/login', { phone, idNumber });
      setWalletToken(res.data.data.token);
      navigate('/wallet/mis-compras');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No pudimos entrar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const actual = SLIDES[slide];

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#04070d] text-white">
      {/* El resplandor azul de la marca ocupa la mitad de arriba y se apaga hacia abajo, para
          que el formulario quede sobre negro y se lea sin competir con el fondo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(155% 82% at 80% 2%, rgba(238,247,255,0.97) 0%, rgba(170,212,255,0.62) 11%, rgba(58,136,245,0.46) 24%, rgba(20,74,185,0.30) 38%, rgba(8,26,64,0.12) 54%, rgba(4,7,13,0) 70%)',
        }}
      />
      {/* Segundo velo, más oscuro abajo: sella el negro detrás de las casillas. Sin él el azul
          del resplandor llega hasta el formulario y le baja el contraste al texto tenue. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(4,7,13,0) 28%, rgba(4,7,13,0.80) 52%, #04070d 74%)' }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-9">
        {/* La marca propia de Wallet ya viene en blanco con las ondas azules: no lleva texto al
            lado ni hace falta invertirla como al logo de QuickTap. Va arriba a la izquierda,
            separada del bloque de abajo. */}
        {/* self-start: como hijo directo de un flex column, sin esto `align-items: stretch` lo
            estira a todo el ancho y `w-auto` no alcanza para evitarlo. */}
        <img src={WALLET_WORDMARK_URL} alt={WALLET_NAME} className="h-12 w-auto self-start" />

        {/* mt-auto: el carrusel y el formulario quedan pegados abajo, con el logo arriba. */}
        <div className="mt-auto">
          {/* ---------- Carrusel: qué es Wallet ---------- */}
          {/* min-h al alto real del texto más largo: fija el bloque para que el formulario no
              salte entre diapositivas, sin dejar hueco muerto debajo del párrafo. */}
          <div className="min-h-[124px]" aria-live="polite">
            {/* key por diapositiva: React remonta el bloque y la animación vuelve a correr. */}
            <div key={slide} className="wallet-slide">
              <h1 className="text-[30px] font-bold leading-[1.14] tracking-tight">
                {actual.titulo}
                <br />
                <span className="text-[#3d9bff]">{actual.resalte}</span>
              </h1>
              <p className="mt-3 max-w-[19rem] text-[13.5px] font-light leading-relaxed text-white/55">
                {actual.texto}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.resalte}
                type="button"
                onClick={() => {
                  setSlide(i);
                  setAutoRota(false);
                }}
                aria-label={`Ver ${i + 1} de ${SLIDES.length}`}
                aria-current={i === slide}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === slide ? 'w-7 bg-[#009aff]' : 'w-1.5 bg-white/25 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ---------- Ingreso ---------- */}
        <form onSubmit={onSubmit} className="mt-8 space-y-2">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">Teléfono</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0414-1234567"
              className="mt-1 w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-[13px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#3d9bff] focus:bg-white/[0.09]"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">Cédula</span>
            {/* Solo dígitos: si el cliente escribe la "V" no entra, así que no hace falta
                aclararlo en la etiqueta. */}
            <input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="12345678"
              className="mt-1 w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-[13px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#3d9bff] focus:bg-white/[0.09]"
            />
          </label>

          {error && <p className="pt-0.5 text-center text-[11.5px] text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="!mt-4 w-full rounded-full py-2 text-[13px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(0,154,255,0.8)] transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-[9px] font-light leading-snug text-white/30">
          Usa el mismo teléfono con el que compraste. Si no reconoce tus datos, pídele al negocio
          que verifique tu cédula en su ficha de cliente.
        </p>
      </div>
    </div>
  );
}

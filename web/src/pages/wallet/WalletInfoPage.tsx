import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  Download,
  History,
  QrCode,
  Receipt,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { WALLET_NAME, WALLET_WORDMARK_URL } from './walletBrand';

/**
 * Página pública que explica qué es QuickTap Wallet (quicktap.club/wallet/conoce).
 *
 * Misma línea gráfica del portal — fondo #04070d, resplandor azul arriba, wordmark blanco —
 * porque su trabajo es que quien llegue desde el banner de la home reconozca DESPUÉS la app
 * que instaló: si la página de venta y el producto no se parecen, la descarga se siente como
 * un error. Cierra con la descarga de la APK, que es a lo que se invita.
 */

const APK_URL = 'https://github.com/leonardphotos/QuickTap/releases/latest/download/QuickTap-Wallet.apk';

const FUNCIONES = [
  {
    icono: Wallet,
    titulo: 'Tu saldo, sin preguntar',
    texto: 'Cuánto debes y a quién, al día. Cada negocio con su cuenta y su detalle de compras.',
  },
  {
    icono: CalendarClock,
    titulo: 'Cuotas claras',
    texto: 'Tu plan de pago completo: cada cuota con su monto, su fecha y la barra de cuánto llevas.',
  },
  {
    icono: Receipt,
    titulo: 'Reporta tus abonos',
    texto: 'Paga como prefieras, sube el comprobante desde el teléfono y el negocio lo verifica.',
  },
  {
    icono: QrCode,
    titulo: 'Tus entradas, con su código',
    texto:
      'Las entradas de eventos viven aquí. Si financiaste, el código se va completando a medida que pagas — al 100% aparece el QR para entrar.',
  },
  {
    icono: History,
    titulo: 'Todo tu historial QuickTap',
    texto: 'Lo que compraste en tiendas, restaurantes y canchas, en un solo hilo. Toca un negocio y vuelve a comprarle.',
  },
  {
    icono: Bell,
    titulo: 'Recordatorios a tiempo',
    texto: 'La app te avisa 3 días antes de que venza cada cuota, para que ninguna te agarre por sorpresa.',
  },
  {
    icono: ShieldCheck,
    titulo: 'Tu clave, tu cuenta',
    texto: 'Entras con tu teléfono y una clave tuya, creada tras verificar tu número por SMS.',
  },
];

export default function WalletInfoPage() {
  useDocumentMeta(
    `${WALLET_NAME} — Tus compras, en un solo lugar`,
    'Saldo, cuotas, abonos, entradas con QR y recordatorios. El portal del cliente de QuickTap.',
  );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#04070d] text-white">
      {/* El mismo resplandor de la portada del Wallet: arriba a la derecha, apagándose hacia
          abajo para que el contenido se lea sobre negro. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            'radial-gradient(120% 90% at 82% 0%, rgba(238,247,255,0.9) 0%, rgba(170,212,255,0.5) 12%, rgba(58,136,245,0.38) 26%, rgba(20,74,185,0.22) 42%, rgba(4,7,13,0) 68%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-md px-6 pb-16 pt-9 sm:max-w-lg lg:max-w-6xl lg:px-10">
        {/* ---------- Marca ---------- */}
        <span className="flex flex-col items-start">
          <img src={WALLET_WORDMARK_URL} alt={WALLET_NAME} className="h-10 w-auto" />
          <span className="mt-1 text-[10px] font-light tracking-wide text-white/40">by QuickTap</span>
        </span>

        {/* ---------- Qué es: en escritorio, texto a la izquierda y el teléfono al lado ---------- */}
        <div className="lg:mt-6 lg:grid lg:grid-cols-[1.1fr_auto] lg:items-center lg:gap-16">
          <div>
        <h1 className="mt-12 text-[34px] font-bold leading-[1.12] tracking-tight lg:mt-0 lg:text-[52px]">
          Tus compras,
          <br />
          <span className="text-[#3d9bff]">en tu bolsillo.</span>
        </h1>
        <p className="mt-4 max-w-[24rem] text-[14px] font-light leading-relaxed text-white/55 lg:max-w-md lg:text-[15.5px]">
          QuickTap Wallet es tu portal como cliente: lo que llevas a crédito, tus cuotas, tus
          entradas y tu historial en cualquier negocio QuickTap — tiendas, restaurantes y
          canchas.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 lg:mt-8">
          <a
            href={APK_URL}
            className="wallet-tap inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(0,154,255,0.8)]"
            style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
          >
            <Download className="h-4 w-4" /> Descargar la app
          </a>
          <Link to="/wallet" className="wallet-tap inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-[13.5px] font-semibold text-white/80 transition-colors hover:bg-white/10">
            Entrar a mi Wallet <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
          </div>

          {/* El teléfono con el portal dibujado: en móvil sobra (ya estás EN un teléfono),
              en escritorio es lo que hace la página. */}
          <div className="hidden lg:block">
            <img
              src="/images/wallet-mockup.png"
              alt="QuickTap Wallet en un teléfono, con el saldo y el historial de compras"
              className="w-[440px] max-w-none drop-shadow-[0_40px_80px_rgba(0,0,0,0.5)]"
            />
          </div>
        </div>

        {/* ---------- Funciones ---------- */}
        <ul className="mt-14 space-y-2.5 lg:mt-24 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
          {FUNCIONES.map((f, i) => (
            <li
              key={f.titulo}
              className="wallet-fila flex gap-3.5 rounded-2xl bg-white/[0.045] p-4 ring-1 ring-white/[0.06] lg:flex-col lg:gap-0 lg:p-6"
              style={{ '--i': i } as React.CSSProperties}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#009aff]/15">
                <f.icono className="h-[18px] w-[18px] text-[#3d9bff]" />
              </span>
              <span className="min-w-0 lg:mt-4">
                <span className="block text-[14.5px] font-semibold lg:text-[15.5px]">{f.titulo}</span>
                <span className="mt-0.5 block text-[12.5px] font-light leading-relaxed text-white/50 lg:mt-1.5 lg:text-[13px]">{f.texto}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* ---------- Cómo se entra ---------- */}
        <h2 className="mt-14 text-[20px] font-bold lg:mt-24 lg:text-center lg:text-[26px]">Entrar toma un minuto</h2>
        <ol className="mt-4 space-y-3 lg:mx-auto lg:mt-8 lg:grid lg:max-w-4xl lg:grid-cols-3 lg:gap-6 lg:space-y-0">
          {[
            ['1', 'Escribe tu teléfono y tu cédula', 'Los mismos datos con los que compraste en el negocio.'],
            ['2', 'Confirma el código que te llega por SMS', 'Así sabemos que el teléfono es tuyo.'],
            ['3', 'Crea tu clave', 'Con ella entras de ahora en adelante, desde la app o el navegador.'],
          ].map(([n, t, d], i) => (
            <li key={n} className="wallet-fila flex items-start gap-3" style={{ '--i': i } as React.CSSProperties}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-bold text-[#3d9bff]">
                {n}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-[13.5px] font-semibold">{t}</span>
                <span className="block text-[12px] font-light text-white/45">{d}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* ---------- Cierre: la descarga ---------- */}
        <div className="mt-14 rounded-3xl bg-white/[0.045] p-6 text-center ring-1 ring-white/[0.06] lg:mx-auto lg:mt-24 lg:max-w-xl lg:p-10">
          <img src={WALLET_WORDMARK_URL} alt="" className="mx-auto h-7 w-auto" />
          <p className="mt-3 text-[13px] font-light leading-relaxed text-white/55">
            Instala la app en tu Android y recibe el recordatorio de cada cuota antes de que
            venza.
          </p>
          <a
            href={APK_URL}
            className="wallet-tap mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(0,154,255,0.8)] lg:mx-auto lg:w-auto lg:px-10"
            style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 100%)' }}
          >
            <Download className="h-4 w-4" /> Descargar para Android (APK)
          </a>
          <p className="mt-3 text-[10.5px] font-light text-white/30">
            Gratis · también puedes usarlo desde el navegador en quicktap.club/wallet
          </p>
        </div>
      </div>
    </div>
  );
}

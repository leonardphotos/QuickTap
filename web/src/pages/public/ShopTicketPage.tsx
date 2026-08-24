import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/api/client';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

/**
 * La entrada que el asistente abre en su teléfono (/entrada/:accessToken).
 *
 * Pública a propósito: quien compró no tiene cuenta en ningún lado, y el token opaco del QR es
 * lo único que da acceso — mismo criterio que el ticket de reserva del club.
 *
 * Formato de pasaje de avión, con el talón separado por la línea perforada: es la forma que
 * todo el mundo ya sabe leer, y deja el QR aislado en su propio bloque para que el lector de
 * la puerta lo enfoque sin capturar el resto del boleto.
 */

interface Entrada {
  accessToken: string;
  negocio: string;
  logoUrl: string | null;
  evento: string;
  fecha: string | null;
  hora: string | null;
  puesto: number;
  precio: number;
  titular: string | null;
  usada: boolean;
  usadaEl: string | null;
}

const fechaLarga = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

export default function ShopTicketPage() {
  const { accessToken = '' } = useParams();
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDocumentMeta(entrada ? `Entrada — ${entrada.evento}` : 'Entrada');

  useEffect(() => {
    api
      .get(`/public/tickets/${accessToken}`)
      .then((r) => setEntrada(r.data.data))
      .catch((e) => setError(e.response?.data?.error ?? 'No pudimos cargar esta entrada.'));
  }, [accessToken]);

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#04070d] px-6 text-center text-white/70">
        {error}
      </div>
    );
  }
  if (!entrada) {
    return <div className="flex min-h-dvh items-center justify-center bg-[#04070d] text-white/40">Cargando…</div>;
  }

  return (
    <div className="min-h-dvh bg-[#04070d] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[26px] bg-[#141a22] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
        {/* Cabecera con el degradado de marca */}
        <div
          className="px-5 pb-5 pt-6"
          style={{ background: 'linear-gradient(135deg, #009aff 0%, #056CF2 55%, #001b43 100%)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Entrada</p>
            {entrada.logoUrl && <img src={entrada.logoUrl} alt="" className="h-6 w-auto rounded" />}
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">{entrada.evento}</h1>
          <p className="mt-0.5 text-[13px] font-light text-white/75">{entrada.negocio}</p>
        </div>

        {/* Datos del pasaje */}
        <div className="grid grid-cols-2 gap-y-4 px-5 py-5">
          <Dato etiqueta="Fecha" valor={entrada.fecha ? fechaLarga(entrada.fecha) : 'Por confirmar'} />
          <Dato etiqueta="Hora" valor={entrada.hora ?? '—'} />
          <Dato etiqueta="Titular" valor={entrada.titular ?? 'Sin nombre'} />
          <Dato etiqueta="Puesto" valor={`#${entrada.puesto}`} />
        </div>

        {/* Línea perforada: el corte del talón. Los dos semicírculos son los huecos laterales. */}
        <div className="relative">
          <div className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[#04070d]" />
          <div className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[#04070d]" />
          <div className="mx-5 border-t-2 border-dashed border-white/15" />
        </div>

        {/* El talón: solo el código, para que el lector lo enfoque sin nada alrededor */}
        <div className="flex flex-col items-center px-5 pb-7 pt-6">
          {entrada.usada ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <p className="text-[15px] font-bold text-emerald-300">Esta entrada ya se usó</p>
              {entrada.usadaEl && (
                <p className="text-[11px] font-light text-white/40">
                  Ingresó el {new Date(entrada.usadaEl).toLocaleString('es-VE')}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Fondo blanco fijo: el QR necesita contraste real, y sobre el panel oscuro
                  muchos lectores no lo enganchan. */}
              <div className="rounded-2xl bg-white p-3">
                <QRCodeSVG value={entrada.accessToken} size={168} />
              </div>
              <p className="mt-3 text-center text-[11px] font-light leading-snug text-white/40">
                Muestra este código en la entrada. Sirve una sola vez.
              </p>
            </>
          )}
          <p className="mt-4 font-mono text-[10px] tracking-widest text-white/25">{entrada.accessToken}</p>
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">{etiqueta}</p>
      <p className="mt-0.5 text-[13.5px] font-semibold capitalize leading-snug">{valor}</p>
    </div>
  );
}

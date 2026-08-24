import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDays, CheckCircle2, Clock, MapPin, Ticket } from 'lucide-react';
import { api } from '@/api/client';
import { getWalletToken } from './walletSession';

/**
 * Las entradas de eventos del cliente, dentro de QuickTap Wallet.
 *
 * Solo llegan acá las que ya existen, y un boleto se emite recién cuando el pago quedó
 * verificado (venta del POS, o pedido de la tienda que el local confirmó — ver
 * shop-tickets.service.ts). O sea: si el cliente la ve acá, ya está aprobada.
 *
 * Cada entrada ocupa la pantalla y se voltea al tocarla: el frente es el arte que subió el
 * local, el reverso es el QR con los datos. El QR no vive en el frente a propósito — así el
 * boleto se puede mostrar en una historia o mandar por chat sin regalar el código de acceso.
 */

export interface EntradaWallet {
  id: string;
  accessToken: string;
  negocio: string;
  evento: string;
  fecha: string | null;
  hora: string | null;
  puesto: number;
  precio: number;
  titular: string | null;
  imagen: string | null;
  usada: boolean;
  usadaEl: string | null;
  pasado: boolean;
}

const money = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaLarga = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long' })
    : 'Fecha por confirmar';

export default function WalletEntradasPage() {
  const [entradas, setEntradas] = useState<EntradaWallet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volteada, setVolteada] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/public/wallet/tickets', { headers: { Authorization: `Bearer ${getWalletToken()}` } })
      .then((r) => setEntradas(r.data.data))
      .catch(() => setError('No pudimos cargar tus entradas.'));
  }, []);

  if (error) return <p className="px-5 py-10 text-center text-sm font-light text-white/50">{error}</p>;
  if (!entradas) return <p className="px-5 py-10 text-center text-sm font-light text-white/40">Cargando…</p>;

  const proximas = entradas.filter((e) => !e.pasado);
  const pasadas = entradas.filter((e) => e.pasado);

  if (entradas.length === 0) {
    return (
      <div className="wallet-fila flex flex-col items-center px-8 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06]">
          <Ticket className="h-6 w-6 text-white/35" />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-white">Todavía no tienes entradas</p>
        <p className="mt-1 max-w-[17rem] text-[12.5px] font-light leading-relaxed text-white/40">
          Cuando compres la entrada de un evento y el local confirme tu pago, aparece acá con su
          código para entrar.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8">
      <p className="pb-3 pt-1 text-[11px] font-medium uppercase tracking-wider text-white/35">
        {proximas.length > 0 ? 'Próximos eventos' : 'Tus entradas'}
      </p>
      <div className="space-y-4">
        {proximas.map((e, i) => (
          <TarjetaEntrada
            key={e.id}
            entrada={e}
            indice={i}
            volteada={volteada === e.id}
            onVoltear={() => setVolteada((v) => (v === e.id ? null : e.id))}
          />
        ))}
      </div>

      {pasadas.length > 0 && (
        <>
          <p className="pb-3 pt-7 text-[11px] font-medium uppercase tracking-wider text-white/35">Ya pasaron</p>
          <div className="space-y-4 opacity-50">
            {pasadas.map((e, i) => (
              <TarjetaEntrada
                key={e.id}
                entrada={e}
                indice={i}
                volteada={volteada === e.id}
                onVoltear={() => setVolteada((v) => (v === e.id ? null : e.id))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TarjetaEntrada({
  entrada,
  indice,
  volteada,
  onVoltear,
}: {
  entrada: EntradaWallet;
  indice: number;
  volteada: boolean;
  onVoltear: () => void;
}) {
  const [imagenRota, setImagenRota] = useState(false);

  return (
    // Alto fijo en las dos caras: el volteo 3D necesita que las dos midan lo mismo, si no la
    // tarjeta salta de tamaño a mitad del giro.
    <div className="wallet-fila wallet-tap-card ticket-flip h-[27rem] w-full" style={{ '--i': indice } as React.CSSProperties}>
      <button
        type="button"
        onClick={onVoltear}
        aria-label={volteada ? `Ver el arte de ${entrada.evento}` : `Ver el código de ${entrada.evento}`}
        className="ticket-flip-inner block rounded-[26px] text-left"
        data-volteada={volteada}
      >
        {/* ---------- Frente: el arte del evento ---------- */}
        <div className="ticket-cara rounded-[26px] bg-[#141a22]">
          {entrada.imagen && !imagenRota ? (
            // Si el arte no carga (archivo borrado, enlace roto) se cae al degradado en vez de
            // dejar la tarjeta vacía: la entrada tiene que verse igual.
            <img
              src={entrada.imagen}
              alt=""
              onError={() => setImagenRota(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{ background: 'linear-gradient(150deg, #009aff 0%, #056CF2 45%, #001b43 100%)' }}
            />
          )}

          {/* Velo inferior: sin él el texto blanco se pierde sobre una foto clara. */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2"
            style={{ background: 'linear-gradient(180deg, rgba(4,7,13,0) 0%, rgba(4,7,13,0.92) 78%)' }}
          />

          {entrada.usada && (
            <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              <CheckCircle2 className="h-3 w-3" /> Usada
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">{entrada.negocio}</p>
            <h2 className="mt-1 text-[26px] font-bold leading-tight text-white">{entrada.evento}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-light text-white/70">
              <span className="flex items-center gap-1 capitalize">
                <CalendarDays className="h-3.5 w-3.5" /> {fechaLarga(entrada.fecha)}
              </span>
              {entrada.hora && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {entrada.hora}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> Puesto {entrada.puesto}
              </span>
            </div>
            <p className="mt-3 text-[11px] font-light text-white/40">Toca para ver tu código</p>
          </div>
        </div>

        {/* ---------- Reverso: el QR y los datos ---------- */}
        <div className="ticket-cara ticket-cara--reverso flex flex-col items-center justify-center rounded-[26px] bg-[#141a22] p-6">
          {entrada.usada ? (
            <>
              <CheckCircle2 className="h-14 w-14 text-emerald-400" />
              <p className="mt-3 text-[15px] font-bold text-emerald-300">Esta entrada ya se usó</p>
              {entrada.usadaEl && (
                <p className="mt-1 text-[11px] font-light text-white/40">
                  Ingresó el {new Date(entrada.usadaEl).toLocaleString('es-VE')}
                </p>
              )}
            </>
          ) : (
            <>
              {/* Fondo blanco fijo: sobre el panel oscuro muchos lectores no enganchan el QR. */}
              <div className="rounded-2xl bg-white p-3">
                <QRCodeSVG value={entrada.accessToken} size={158} />
              </div>
              <p className="mt-3 text-center text-[11px] font-light text-white/40">
                Muestra este código en la entrada. Sirve una sola vez.
              </p>
            </>
          )}

          <div className="mt-5 w-full space-y-2 border-t border-white/[0.08] pt-4">
            <Dato etiqueta="Evento" valor={entrada.evento} />
            <Dato etiqueta="Fecha" valor={`${fechaLarga(entrada.fecha)}${entrada.hora ? ` · ${entrada.hora}` : ''}`} capitalize />
            <Dato etiqueta="Titular" valor={entrada.titular ?? 'Sin nombre'} />
            <Dato etiqueta="Puesto" valor={`#${entrada.puesto}`} />
            <Dato etiqueta="Pagaste" valor={money(entrada.precio)} />
          </div>
        </div>
      </button>
    </div>
  );
}

function Dato({ etiqueta, valor, capitalize }: { etiqueta: string; valor: string; capitalize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[11px] font-light text-white/40">{etiqueta}</span>
      <span className={`truncate text-right text-[12.5px] font-semibold text-white ${capitalize ? 'capitalize' : ''}`}>
        {valor}
      </span>
    </div>
  );
}

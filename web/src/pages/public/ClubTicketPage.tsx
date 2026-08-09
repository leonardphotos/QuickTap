import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/api/client';
import { clubGradient, hhmmOf, type PublicClub } from './clubPublic';

interface Ticket {
  playerName: string;
  playerPhone: string;
  playerCount: number;
  totalBase: string;
  totalBs: string;
  status: string;
  accessToken: string;
  checkedInAt: string | null;
  requestedExtras: { id: string; name: string; quantity: number }[] | null;
  block: { startsAt: string; endsAt: string; court: { name: string; indoor: boolean } };
  restaurant: { name: string; slug: string; logoUrl: string | null; theme: PublicClub['theme'] };
}

/**
 * El "ticket" del jugador: su QR de acceso. El token no codifica datos de la
 * reserva, solo identifica — el servidor resuelve y valida al escanear.
 */
export default function ClubTicketPage() {
  const { accessToken = '' } = useParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get(`/public/club/bookings/token/${accessToken}`)
      .then((r) => setTicket(r.data.data))
      .catch(() => setError(true));
  }, [accessToken]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0d1b2a] px-6">
        <p className="text-center font-light text-white/60">No encontramos esta reserva.</p>
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0d1b2a] px-6">
        <p className="font-light text-white/50">Cargando…</p>
      </div>
    );
  }

  const day = new Date(ticket.block.startsAt).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Caracas',
  });
  const cancelled = ticket.status === 'CANCELLED';

  return (
    <div className="min-h-screen px-5 py-8 text-white" style={clubGradient(ticket.restaurant.theme)}>
      <div className="mx-auto max-w-sm">
        <div className="text-center">
          {ticket.restaurant.logoUrl && (
            <img
              src={ticket.restaurant.logoUrl}
              alt=""
              className="mx-auto mb-3 h-14 w-14 rounded-2xl object-cover ring-1 ring-white/30"
            />
          )}
          <p className="text-[17px] font-bold">{ticket.restaurant.name}</p>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-white/25 bg-white/15 backdrop-blur-xl">
          <div className="border-b border-dashed border-white/25 p-6 text-center">
            {cancelled ? (
              <p className="rounded-2xl bg-rose-500/25 py-3 text-[14px] font-bold">Reserva cancelada</p>
            ) : (
              <>
                <div className="inline-block rounded-3xl bg-white p-4 shadow-xl">
                  <QRCodeSVG value={ticket.accessToken} size={168} fgColor="#001B43" />
                </div>
                <p className="mt-3 text-[12px] font-light text-white/65">
                  Muestra este código en recepción al llegar.
                </p>
              </>
            )}

            {ticket.checkedInAt && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] font-bold text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Ya registraste tu entrada
              </p>
            )}
          </div>

          <div className="space-y-3 p-6">
            <Row label="Cancha" value={ticket.block.court.name} />
            <Row label="Día" value={day} capitalize />
            <Row label="Hora" value={`${hhmmOf(ticket.block.startsAt)} a ${hhmmOf(ticket.block.endsAt)}`} />
            <Row label="Jugadores" value={String(ticket.playerCount)} />
            <Row label="A nombre de" value={ticket.playerName} />

            {ticket.requestedExtras && ticket.requestedExtras.length > 0 && (
              <div className="border-t border-white/15 pt-3">
                <p className="text-[13px] font-medium text-white/55">Listo al llegar</p>
                <ul className="mt-1 space-y-0.5">
                  {ticket.requestedExtras.map((e) => (
                    <li key={e.id} className="text-[14px] font-semibold">
                      {e.quantity}× {e.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] font-light text-white/45">Se paga en el club.</p>
              </div>
            )}

            <div className="border-t border-white/15 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-white/55">Cancha</span>
                <span className="text-[19px] font-bold">${ticket.totalBase}</span>
              </div>
              <p className="text-right text-[12px] font-light text-white/45">
                Bs {Number(ticket.totalBs).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[12px] font-light text-white/45">
          Guarda este enlace: es tu entrada a la cancha.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[13px] font-medium text-white/55">{label}</span>
      <span className={`text-right text-[14px] font-semibold ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

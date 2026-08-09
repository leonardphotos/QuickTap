import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/api/client';

interface Ticket {
  playerName: string;
  playerPhone: string;
  playerCount: number;
  totalBase: string;
  totalBs: string;
  status: string;
  accessToken: string;
  checkedInAt: string | null;
  block: { startsAt: string; endsAt: string; court: { name: string; indoor: boolean } };
  restaurant: { name: string; slug: string; logoUrl: string | null };
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
      <div className="grid min-h-screen place-items-center bg-[#fafafa] px-6">
        <p className="text-center font-light text-brand-950/50">No encontramos esta reserva.</p>
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fafafa] px-6">
        <p className="font-light text-brand-950/40">Cargando…</p>
      </div>
    );
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' });
  const day = new Date(ticket.block.startsAt).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Caracas',
  });
  const cancelled = ticket.status === 'CANCELLED';

  return (
    <div className="min-h-screen bg-[#fafafa] px-5 py-8">
      <div className="mx-auto max-w-sm">
        <div className="text-center">
          {ticket.restaurant.logoUrl && (
            <img src={ticket.restaurant.logoUrl} alt="" className="mx-auto mb-3 h-12 w-12 rounded-xl object-cover" />
          )}
          <p className="font-bold text-brand-950">{ticket.restaurant.name}</p>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-brand-950/[0.08] bg-white shadow-sm">
          <div className="border-b border-dashed border-brand-950/10 p-6 text-center">
            {cancelled ? (
              <p className="rounded-xl bg-rose-50 py-3 text-[14px] font-bold text-rose-700">Reserva cancelada</p>
            ) : (
              <>
                <div className="inline-block rounded-2xl bg-white p-3">
                  <QRCodeSVG value={ticket.accessToken} size={172} fgColor="#001B43" />
                </div>
                <p className="mt-3 text-[12px] font-light text-brand-950/45">
                  Muestra este código en recepción al llegar.
                </p>
              </>
            )}

            {ticket.checkedInAt && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Ya registraste tu entrada
              </p>
            )}
          </div>

          <div className="space-y-3 p-6">
            <Row label="Cancha" value={ticket.block.court.name} />
            <Row label="Día" value={day} capitalize />
            <Row label="Hora" value={`${fmt(ticket.block.startsAt)} a ${fmt(ticket.block.endsAt)}`} />
            <Row label="Jugadores" value={String(ticket.playerCount)} />
            <Row label="A nombre de" value={ticket.playerName} />
            <div className="border-t border-brand-950/[0.06] pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-brand-950/50">Total</span>
                <span className="text-[18px] font-bold text-brand-950">${ticket.totalBase}</span>
              </div>
              <p className="text-right text-[12px] font-light text-brand-950/40">
                Bs {Number(ticket.totalBs).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[12px] font-light text-brand-950/35">
          Guarda este enlace: es tu entrada a la cancha.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[13px] font-medium text-brand-950/50">{label}</span>
      <span className={`text-right text-[14px] font-semibold text-brand-950 ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </span>
    </div>
  );
}

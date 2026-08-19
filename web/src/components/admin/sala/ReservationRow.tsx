import { Clock, MessageCircle, Users } from 'lucide-react';
import type { Reservation } from '@/types';

const STATUS_STYLES: Record<Reservation['status'], { label: string; className: string }> = {
  PENDING: { label: 'Por aceptar', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  CONFIRMED: { label: 'Confirmada', className: 'bg-brand-500/10 text-brand-600 border-brand-500/20' },
  SEATED: { label: 'Sentada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  NO_SHOW: { label: 'No llegó', className: 'bg-brand-950/[0.06] text-brand-950/50 border-transparent' },
  CANCELLED: { label: 'Cancelada', className: 'bg-brand-950/[0.06] text-brand-950/40 border-transparent' },
};

/** Una reserva en la barra lateral de Sala: hora, quién, cuántos y en qué mesa. */
export function ReservationRow({
  reservation,
  onSeat,
  onWhatsapp,
}: {
  reservation: Reservation;
  /** Solo se ofrece si todavía se puede sentar (confirmada y no sentada aún). */
  onSeat?: (r: Reservation) => void;
  onWhatsapp?: (r: Reservation) => void;
}) {
  const status = STATUS_STYLES[reservation.status];
  const tables = reservation.tables.map((t) => t.number).join(', ');
  const canSeat = onSeat && (reservation.status === 'CONFIRMED' || reservation.status === 'PENDING');

  return (
    <li className="rounded-xl border border-brand-950/10 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-950">
            <Clock className="h-3.5 w-3.5 shrink-0 text-brand-950/40" />
            {reservation.time}
            <span className="truncate font-semibold">{reservation.customerName}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-brand-950/50">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {reservation.partySize}
            </span>
            {tables && <span className="truncate">Mesa {tables}</span>}
          </p>
          {reservation.note && <p className="mt-0.5 truncate text-[11px] italic text-brand-950/40">{reservation.note}</p>}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>

      {(canSeat || onWhatsapp) && (
        <div className="mt-2 flex items-center gap-1.5">
          {canSeat && (
            <button
              type="button"
              onClick={() => onSeat(reservation)}
              className="rounded-full bg-brand-500 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-400"
            >
              Sentar
            </button>
          )}
          {onWhatsapp && reservation.customerPhone && (
            <button
              type="button"
              onClick={() => onWhatsapp(reservation)}
              aria-label={`Escribirle a ${reservation.customerName} por WhatsApp`}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-brand-950/10 text-brand-950/50 hover:text-emerald-600"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

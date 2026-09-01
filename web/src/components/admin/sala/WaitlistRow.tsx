import { Bell, MessageCircle, Table2, Timer, Users, X } from 'lucide-react';
import type { WaitlistEntry } from '@/types';

/** Alguien de la lista de espera: cuánto lleva, cuántos son y qué se puede hacer con él. */
export function WaitlistRow({
  entry,
  onSeat,
  onNotify,
  onCancel,
  onWhatsapp,
  onOpenTable,
}: {
  entry: WaitlistEntry;
  onSeat?: (e: WaitlistEntry) => void;
  onNotify?: (e: WaitlistEntry) => void;
  onCancel?: (e: WaitlistEntry) => void;
  onWhatsapp?: (e: WaitlistEntry) => void;
  /** Ya sentado: tocar la fila abre su mesa para ver la cuenta o editar el pedido. */
  onOpenTable?: (tableId: string) => void;
}) {
  const seated = entry.status === 'SEATED';
  // Se pasó de lo prometido: se marca en rojo para que el salón lo priorice.
  const late = entry.quotedMinutes != null && entry.waitedMinutes != null && entry.waitedMinutes > entry.quotedMinutes;
  const table = entry.seatedTable;
  const openable = seated && table && onOpenTable;

  return (
    <li
      onClick={openable ? () => onOpenTable(table.id) : undefined}
      className={`rounded-xl border border-brand-950/10 bg-white px-3 py-2.5 ${
        openable ? 'cursor-pointer transition-colors hover:border-brand-500/40 hover:bg-brand-500/[0.04]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-950">{entry.customerName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-brand-950/50">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {entry.partySize}
            </span>
            <span className={`flex items-center gap-1 ${late ? 'font-semibold text-red-600' : ''}`}>
              <Timer className="h-3 w-3" />
              {entry.waitedMinutes ?? 0} min
              {entry.quotedMinutes != null && <span className="opacity-60">/ {entry.quotedMinutes}</span>}
            </span>
            {table ? (
              <span className="flex items-center gap-1 font-semibold text-brand-600">
                <Table2 className="h-3 w-3" /> {table.number}
              </span>
            ) : (
              entry.zone && <span className="truncate">{entry.zone.name}</span>
            )}
          </p>
          {entry.note && <p className="mt-0.5 truncate text-[11px] italic text-brand-950/40">{entry.note}</p>}
        </div>
        {entry.status === 'NOTIFIED' && (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Avisado
          </span>
        )}
        {seated && (
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Sentado
          </span>
        )}
      </div>

      {!seated && (
        <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {onSeat && (
            <button
              type="button"
              onClick={() => onSeat(entry)}
              className="rounded-full bg-brand-500 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-400"
            >
              Sentar
            </button>
          )}
          {onNotify && entry.status === 'WAITING' && (
            <button
              type="button"
              onClick={() => onNotify(entry)}
              aria-label={`Avisar a ${entry.customerName} que su mesa está lista`}
              title="Avisar que su mesa está lista"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-brand-950/10 text-brand-950/50 hover:text-amber-600"
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          )}
          {onWhatsapp && entry.customerPhone && (
            <button
              type="button"
              onClick={() => onWhatsapp(entry)}
              aria-label={`Escribirle a ${entry.customerName} por WhatsApp`}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-brand-950/10 text-brand-950/50 hover:text-emerald-600"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={() => onCancel(entry)}
              aria-label={`Quitar a ${entry.customerName} de la lista`}
              title="Se fue / ya no espera"
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-full border border-brand-950/10 text-brand-950/40 hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

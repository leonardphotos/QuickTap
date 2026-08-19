import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import type { FloorPlanTable } from '@/types';

/**
 * "Sentar": elegir en qué mesa se sienta un grupo (venga de una reserva o de la lista de espera).
 * Solo ofrece mesas libres, y nunca las que están pegadas a otra — esas no llevan cuenta propia.
 */
export function SeatDialog({
  open,
  title,
  personName,
  /** Mesas que la reserva tenía apartadas: se ofrecen primero porque suele ser la respuesta. */
  suggestedTableIds,
  tables,
  needsIdNumber,
  busy,
  error,
  onSeat,
  onClose,
}: {
  open: boolean;
  title: string;
  personName: string;
  suggestedTableIds?: string[];
  tables: FloorPlanTable[];
  /** La lista de espera no siempre trae cédula y la cuenta la exige. */
  needsIdNumber?: boolean;
  busy?: boolean;
  error?: string | null;
  onSeat: (tableId: string, idNumber?: string) => void;
  onClose: () => void;
}) {
  const [tableId, setTableId] = useState('');
  const [idNumber, setIdNumber] = useState('');

  const free = tables.filter((t) => t.sessions.length === 0 && !t.mergedIntoTableId);
  const suggested = free.filter((t) => suggestedTableIds?.includes(t.id));
  const rest = free.filter((t) => !suggestedTableIds?.includes(t.id));

  useEffect(() => {
    if (!open) return;
    setTableId(suggested[0]?.id ?? '');
    setIdNumber('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!tableId) return;
    onSeat(tableId, idNumber.trim() || undefined);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-brand-950/60">
            Se le abre la cuenta a <span className="font-semibold text-brand-950">{personName}</span> en la mesa que elijas.
          </p>

          {free.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No hay mesas libres en este momento.
            </p>
          ) : (
            <div className="space-y-2">
              {suggested.length > 0 && (
                <TableGroup label="Mesas de la reserva" tables={suggested} selected={tableId} onSelect={setTableId} />
              )}
              {rest.length > 0 && (
                <TableGroup
                  label={suggested.length > 0 ? 'Otras mesas libres' : 'Mesas libres'}
                  tables={rest}
                  selected={tableId}
                  onSelect={setTableId}
                />
              )}
            </div>
          )}

          {needsIdNumber && (
            <label className="block text-sm text-brand-950/60">
              Cédula <span className="text-brand-950/35">(opcional)</span>
              <input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="V-12345678"
                className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm text-brand-950 focus:border-brand-500 focus:outline-none"
              />
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <TextureButton
            variant="brand"
            size="default"
            disabled={!tableId || busy}
            className="!w-auto disabled:opacity-50"
          >
            {busy ? 'Sentando…' : 'Sentar'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TableGroup({
  label,
  tables,
  selected,
  onSelect,
}: {
  label: string;
  tables: FloorPlanTable[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-brand-950/40">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {tables.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              selected === t.id ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {t.number}
            <span className="ml-1 opacity-60">{t.seats}p</span>
          </button>
        ))}
      </div>
    </div>
  );
}

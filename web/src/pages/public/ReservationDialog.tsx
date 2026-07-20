import { useEffect, useState } from 'react';
import { Table2 } from 'lucide-react';
import { api } from '../../api/client';
import type { Restaurant } from '../../types';
import { TextureButton } from '@/components/ui/texture-button';
import {
  FamilyDrawerRoot,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerClose,
} from '@/components/ui/family-drawer';

interface Props {
  restaurant: Restaurant;
  onClose: () => void;
}

type TableStatus = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED';

interface ReservationTable {
  id: string;
  number: string;
  zone: { id: string; name: string } | null;
  status: TableStatus;
}

const STATUS_STYLES: Record<TableStatus, { ring: string; bg: string; text: string; label: string }> = {
  AVAILABLE: { ring: 'ring-emerald-500', bg: 'bg-emerald-500', text: 'text-white', label: 'Disponible' },
  RESERVED: { ring: 'ring-amber-500', bg: 'bg-amber-500', text: 'text-white', label: 'Reservada' },
  OCCUPIED: { ring: 'ring-red-500', bg: 'bg-red-500', text: 'text-white', label: 'Ocupada' },
};

function todayStr(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export default function ReservationDialog({ restaurant, onClose }: Props) {
  const [tables, setTables] = useState<ReservationTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('19:00');
  const [partySize, setPartySize] = useState(2);

  const [customerName, setCustomerName] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get(`/public/reservations/${restaurant.slug}/tables`)
      .then((res) => setTables(res.data.data))
      .catch(() => setError('No pudimos cargar las mesas.'))
      .finally(() => setLoadingTables(false));
  }, [restaurant.slug]);

  function toggleTable(id: string) {
    setSelectedTableIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function submit() {
    if (selectedTableIds.length === 0) {
      setError('Elige al menos una mesa.');
      return;
    }
    if (!customerName.trim()) {
      setError('Escribe tu nombre.');
      return;
    }
    if (!customerIdNumber.trim()) {
      setError('Escribe tu cédula.');
      return;
    }
    if (!customerPhone.trim()) {
      setError('Escribe tu teléfono.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.post(`/public/reservations/${restaurant.slug}`, {
        date,
        time,
        partySize,
        tableIds: selectedTableIds,
        customerName: customerName.trim(),
        customerIdNumber: customerIdNumber.trim(),
        customerPhone: customerPhone.trim(),
      });
      setDone(true);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear la reserva.');
    } finally {
      setSending(false);
    }
  }

  return (
    <FamilyDrawerRoot open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <FamilyDrawerPortal>
        <FamilyDrawerOverlay onClick={onClose} />
        <FamilyDrawerContent>
          <FamilyDrawerAnimatedWrapper>
            <FamilyDrawerClose />

            {done ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-4xl">✅</p>
                <p className="font-semibold text-brand-950">¡Reserva confirmada!</p>
                <p className="text-sm text-brand-950/60 font-light">
                  Te esperamos el {date} a las {time}.
                </p>
                <TextureButton variant="brand" size="default" onClick={onClose} className="mt-4 !w-auto px-6 mx-auto">
                  Listo
                </TextureButton>
              </div>
            ) : (
              <div className="pt-6 space-y-4">
                <h3 className="font-semibold text-brand-950">Reservar mesa</h3>

                <div>
                  <p className="text-sm font-semibold text-brand-950 mb-2">Elige tu(s) mesa(s)</p>
                  <div className="flex items-center gap-3 text-xs text-brand-950/50 mb-2">
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Disponible
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Reservada
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Ocupada
                    </span>
                  </div>
                  {loadingTables ? (
                    <p className="text-sm text-brand-950/40 font-light py-4 text-center">Cargando mesas…</p>
                  ) : tables.length === 0 ? (
                    <p className="text-sm text-brand-950/40 font-light py-4 text-center">
                      Este restaurante no tiene mesas configuradas.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-3 max-h-56 overflow-y-auto py-1">
                      {tables.map((t) => {
                        const style = STATUS_STYLES[t.status];
                        const selected = selectedTableIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleTable(t.id)}
                            className="flex flex-col items-center gap-1"
                          >
                            <span
                              className={`flex h-12 w-12 items-center justify-center rounded-full ${style.bg} ${style.text} ${
                                selected ? `ring-4 ring-offset-2 ${style.ring}` : ''
                              }`}
                            >
                              <Table2 className="h-5 w-5" />
                            </span>
                            <span className="text-[11px] text-brand-950/60 font-medium">Mesa {t.number}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-brand-950/60">Día</span>
                    <input
                      type="date"
                      value={date}
                      min={todayStr()}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-auto text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-brand-950/60">Hora</span>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-auto text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-brand-950/60">Cantidad de personas</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={partySize}
                    onChange={(e) => setPartySize(Number(e.target.value) || 1)}
                    className="mt-1 w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                </label>

                <div className="space-y-2 pt-1 border-t border-brand-950/10">
                  <p className="text-sm font-semibold text-brand-950 pt-2">Tus datos</p>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nombre *"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                  <input
                    value={customerIdNumber}
                    onChange={(e) => setCustomerIdNumber(e.target.value)}
                    placeholder="Cédula *"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Teléfono *"
                    className="w-full text-sm border border-brand-950/15 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={sending}
                  onClick={submit}
                  className="disabled:opacity-50"
                >
                  {sending ? 'Reservando…' : 'Confirmar reserva'}
                </TextureButton>
              </div>
            )}
          </FamilyDrawerAnimatedWrapper>
        </FamilyDrawerContent>
      </FamilyDrawerPortal>
    </FamilyDrawerRoot>
  );
}

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/utils/apiOrigin';
import { Ban, Check, Clock, MessageCircle, Table2, Users } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { sendWhatsappOrOpen } from '@/utils/sendWhatsapp';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';

interface Reservation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  customerName: string;
  customerIdNumber: string;
  customerPhone: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  tables: { id: string; number: string }[];
}

function whatsappUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${phone.replace(/\D/g, '')}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function reservationMessage(restaurantName: string, r: Reservation): string {
  const tables = r.tables.map((t) => t.number).join(', ');
  return [
    `Hola ${r.customerName}, te escribimos de *${restaurantName}* sobre tu reserva.`,
    `📅 ${formatDate(r.date)}, ${r.time} · 👥 ${r.partySize} · 🪑 Mesa ${tables}`,
    r.status === 'CONFIRMED' ? '¡Tu reserva está confirmada, te esperamos!' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Pestaña "Reservas" (Cajero/Administrador): reservas hechas desde el botón "Mesa" del menú
 * público. Quedan PENDING hasta que el staff las acepte o cancele; el cliente se entera por WhatsApp. */
export default function ReservationsPage() {
  const { restaurant } = useAuth();
  const { show, toastMessage } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendWhatsapp(r: Reservation) {
    const message = reservationMessage(restaurant?.name ?? '', r);
    const sent = await sendWhatsappOrOpen(r.customerPhone, message, whatsappUrl(r.customerPhone, message));
    if (sent) show('Mensaje enviado');
  }

  function load() {
    api
      .get('/reservations')
      .then((res) => setReservations(res.data.data))
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const socket: Socket = io(API_ORIGIN || '/', { auth: { token: getToken() } });
    socket.on('reservation:new', load);
    socket.on('reservation:updated', load);
    return () => {
      socket.disconnect();
    };
  }, []);

  async function accept(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/reservations/${id}/accept`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo aceptar la reserva.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    if (!confirm('¿Cancelar esta reserva?')) return;
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/reservations/${id}/cancel`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cancelar la reserva.');
    } finally {
      setBusyId(null);
    }
  }

  const pending = reservations.filter((r) => r.status === 'PENDING');
  const confirmed = reservations.filter((r) => r.status === 'CONFIRMED');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Reservas</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Reservas hechas desde el menú público. El cliente recibe la confirmación por WhatsApp recién cuando aceptas
          la suya.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-brand-950/70 flex items-center gap-2">
          Pendientes por aceptar
          {pending.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light">No hay reservas pendientes.</p>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 divide-y divide-amber-200/60">
            {pending.map((r) => (
              <ReservationRow
                key={r.id}
                reservation={r}
                busy={busyId === r.id}
                onAccept={() => accept(r.id)}
                onCancel={() => cancel(r.id)}
                onSendWhatsapp={() => sendWhatsapp(r)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-brand-950/70">Confirmadas próximamente</h2>
        {confirmed.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light">No hay reservas confirmadas.</p>
        ) : (
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
            {confirmed.map((r) => (
              <ReservationRow
                key={r.id}
                reservation={r}
                busy={busyId === r.id}
                onCancel={() => cancel(r.id)}
                onSendWhatsapp={() => sendWhatsapp(r)}
              />
            ))}
          </div>
        )}
      </section>

      <Toast message={toastMessage} />
    </div>
  );
}

function ReservationRow({
  reservation,
  busy,
  onAccept,
  onCancel,
  onSendWhatsapp,
}: {
  reservation: Reservation;
  busy: boolean;
  onAccept?: () => void;
  onCancel: () => void;
  onSendWhatsapp: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand-950">
          {reservation.customerName}{' '}
          <span className="text-brand-950/40 font-normal">· C.I. {reservation.customerIdNumber}</span>
        </p>
        <p className="text-xs text-brand-950/50 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatDate(reservation.date)}, {reservation.time}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {reservation.partySize}
          </span>
          <span className="flex items-center gap-1">
            <Table2 className="h-3 w-3" /> Mesa {reservation.tables.map((t) => t.number).join(', ')}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onSendWhatsapp}
          aria-label="Escribir por WhatsApp"
          className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shrink-0"
        >
          <MessageCircle className="h-4 w-4" />
        </button>
        {onAccept && (
          <TextureButton
            variant="brand"
            size="sm"
            disabled={busy}
            onClick={onAccept}
            className="!w-auto flex items-center gap-1 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Aceptar
          </TextureButton>
        )}
        <TextureButton
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={onCancel}
          className="!w-auto flex items-center gap-1 disabled:opacity-50"
        >
          <Ban className="h-3.5 w-3.5" /> Cancelar
        </TextureButton>
      </div>
    </div>
  );
}

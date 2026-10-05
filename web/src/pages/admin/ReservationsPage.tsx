import { api,getToken } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext.shared';
import { useToast } from '@/hooks/useToast';
import { apiOrigin } from '@/utils/apiOrigin';
import { sendWhatsappOrOpen } from '@/utils/sendWhatsapp';
import { isAdminCashier } from '@/utils/roles';
import { NewReservationDialog } from '@/components/admin/sala/NewReservationDialog';
import type { FloorPlan, FloorPlanTable } from '@/types';
import { Ban,CalendarDays,Check,Clock,MessageCircle,Plus,Search,Table2,Users } from 'lucide-react';
import { useEffect,useState, type ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

interface Reservation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  customerName: string;
  customerIdNumber: string;
  customerPhone: string;
  note?: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  tables: { id: string; number: string }[];
}

function whatsappUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${phone.replace(/\D/g, '')}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', weekday: 'short', day: 'numeric', month: 'short' });
}

function reservationMessage(restaurantName: string, r: Reservation): string {
  const tables = r.tables.map((t) => t.number).join(', ');
  return [
    `Hola ${r.customerName}, te escribimos de *${restaurantName}* sobre tu reserva.`,
    `📅 ${formatDate(r.date)}, ${r.time} · 👥 ${r.partySize} · 🪑 ${tables}`,
    r.status === 'CONFIRMED' ? '¡Tu reserva está confirmada, te esperamos!' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Reservas públicas pendientes y reservas confirmadas por el equipo del restaurante. */
export default function ReservationsPage() {
  const { restaurant, user } = useAuth();
  const canManage = isAdminCashier(user?.role, user?.cashierFullAccess);
  const { show, toastMessage } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [day, setDay] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [tables, setTables] = useState<FloorPlanTable[]>([]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  async function openCreate() {
    setTablesLoading(true);
    setError(null);
    setCreateError(null);
    try {
      const { data } = await api.get<{ data: FloorPlan }>('/tables/floor-plan');
      setTables([...data.data.zones.flatMap((zone) => zone.tables), ...data.data.unzoned]);
      setCreateOpen(true);
    } catch {
      setError('No se pudieron cargar las mesas. Intenta abrir Nueva reserva otra vez.');
    } finally {
      setTablesLoading(false);
    }
  }

  async function createReservation(input: Parameters<ComponentProps<typeof NewReservationDialog>['onCreate']>[0]) {
    if (createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      await api.post('/reservations', input);
      setCreateOpen(false);
      setDay('');
      setQuery('');
      show('Reserva creada y confirmada');
      load();
    } catch (e: any) {
      setCreateError(e.response?.data?.error ?? 'No se pudo crear la reserva. Revisa los datos e intenta nuevamente.');
    } finally {
      setCreateBusy(false);
    }
  }

  async function sendWhatsapp(r: Reservation) {
    const message = reservationMessage(restaurant?.name ?? '', r);
    const sent = await sendWhatsappOrOpen(r.customerPhone, message, whatsappUrl(r.customerPhone, message));
    if (sent) show('Mensaje enviado');
  }

  function load() {
    api
      .get('/reservations')
      .then((res) => setReservations(res.data.data))
      .catch(() => setError('No se pudieron actualizar las reservas. Vuelve a intentarlo.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
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

  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visible = reservations.filter((r) => (!day || r.date.slice(0, 10) === day)
    && normalize(`${r.customerName} ${r.customerPhone} ${r.tables.map((t) => t.number).join(' ')}`).includes(normalize(query.trim())));
  const pending = visible.filter((r) => r.status === 'PENDING');
  const confirmed = visible.filter((r) => r.status === 'CONFIRMED');

  return (
    <div className="space-y-5 text-brand-950">
      <header className="rounded-[28px] border border-brand-950/10 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-xl">
            <p className="font-semibold uppercase tracking-widest text-brand-600 text-xs">Prepara la próxima visita</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Reservas</h1>
            <p className="mt-2 text-brand-950/60 text-base">Organiza las solicitudes del menú y las reservas tomadas por teléfono o en el local.</p>
          </div>
          {canManage && <TextureButton variant="brand" className="!w-auto [&>div]:min-h-11 gap-2" onClick={openCreate} disabled={tablesLoading}>
            <Plus className="h-5 w-5" />{tablesLoading ? 'Preparando mesas…' : 'Nueva reserva'}
          </TextureButton>}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-brand-950/10 pt-5 sm:gap-5">
          {[
            { label: 'Pendientes', value: pending.length, icon: Clock },
            { label: 'Confirmadas', value: confirmed.length, icon: CalendarDays },
            { label: 'Personas confirmadas', value: confirmed.reduce((sum, r) => sum + r.partySize, 0), icon: Users },
          ].map(({ label, value, icon: Icon }) => <div key={label}>
            <Icon className="mb-2 h-5 w-5 text-brand-500" />
            <p className="text-2xl font-semibold tabular-nums">{loading ? '—' : value}</p>
            <p className="mt-1 text-brand-950/60 text-xs">{label}</p>
          </div>)}
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-950/10 bg-white p-4">
        <label className="min-w-0 flex-1 basis-64 text-brand-950/60 text-sm font-medium">Buscar reserva
          <div className="mt-1 flex min-h-11 items-center gap-2 rounded-xl bg-brand-950/[0.04] px-3">
            <Search className="h-4 w-4 shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cliente, teléfono o mesa" className="min-w-0 w-full bg-transparent py-3 text-brand-950 outline-none text-base" />
          </div>
        </label>
        <label className="text-brand-950/60 text-sm font-medium">Día de la reserva
          <input type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} className="mt-1 block min-h-11 max-w-full rounded-xl border border-brand-950/15 px-3 text-brand-950 text-base" />
        </label>
        {(day || query) && <button type="button" className="min-h-11 px-2 text-sm font-medium text-brand-600" onClick={() => { setDay(''); setQuery(''); }}>Limpiar filtros</button>}
        <p className="w-full text-brand-950/50 text-xs">{day ? 'Resumen del día seleccionado.' : 'Reservas activas desde hoy en adelante.'} Contacta al cliente con el botón de WhatsApp.</p>
      </div>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="ml-2 underline" onClick={() => { setError(null); load(); }}>Reintentar</button></div>}
      {loading ? <p role="status" className="p-6 text-brand-950/60 text-base">Preparando tus reservas…</p> :
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {[
            { title: 'Por confirmar', subtitle: 'Solicitudes que necesitan tu respuesta', items: pending, pending: true },
            { title: 'Próximas visitas', subtitle: 'Reservas confirmadas, listas para recibir', items: confirmed, pending: false },
          ].map((group) => <section key={group.title} className="min-w-0 overflow-hidden rounded-[24px] border border-brand-950/10 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-brand-950/10 p-5">
              <div><h2 className="text-lg font-semibold">{group.title}</h2><p className="mt-1 text-brand-950/60 text-xs">{group.subtitle}</p></div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${group.pending ? 'bg-amber-50 text-amber-700' : 'bg-brand-500/10 text-brand-600'}`}>{group.items.length}</span>
            </div>
            {group.items.length ? <div className="divide-y divide-brand-950/10">{group.items.map((r) => <ReservationRow key={r.id} reservation={r} busy={busyId === r.id}
              onAccept={canManage && group.pending ? () => accept(r.id) : undefined}
              onCancel={canManage ? () => cancel(r.id) : undefined} onSendWhatsapp={() => sendWhatsapp(r)} />)}</div>
              : <div className="px-5 py-10 text-center"><CalendarDays className="mx-auto mb-3 h-8 w-8 text-brand-500/60" /><p className="font-medium text-base">{group.pending ? 'Todo al día' : 'Tu próxima visita empieza aquí'}</p><p className="mx-auto mt-2 max-w-xs text-brand-950/60 text-base">{query || day ? 'No hay reservas que coincidan con estos filtros.' : group.pending ? 'Las nuevas solicitudes aparecerán aquí para que puedas aceptarlas.' : 'Crea una reserva o acepta una solicitud para organizar tus próximas mesas.'}</p></div>}
          </section>)}
        </div>}
      {createOpen && tables.length === 0 && <p className="text-base">Necesitas una mesa para crear reservas. <Link to="/admin/tables" className="text-brand-600 underline">Crear mesas</Link></p>}
      <NewReservationDialog open={createOpen} date={day || today} tables={tables} busy={createBusy} error={createError} onCreate={createReservation} onClose={() => { if (!createBusy) setCreateOpen(false); }} />
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
  onCancel?: () => void;
  onSendWhatsapp: () => void;
}) {
  return (
    <div className="space-y-4 p-5">
      <div className="min-w-0">
        <p className="break-words font-semibold text-brand-950 text-base">
          {reservation.customerName}{' '}
          {reservation.customerIdNumber && <span className="text-xs text-brand-950/50 font-normal">· C.I. {reservation.customerIdNumber}</span>}
        </p>
        <p className="text-brand-950/50 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatDate(reservation.date)}, {reservation.time}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {reservation.partySize}
          </span>
          <span className="flex items-center gap-1">
            <Table2 className="h-3 w-3" /> {reservation.tables.map((t) => t.number).join(', ')}
          </span>
        </p>
      </div>
      {reservation.note && <p className="break-words rounded-xl bg-brand-950/[0.03] p-3 text-brand-950/70 text-xs">{reservation.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSendWhatsapp}
          aria-label="Escribir por WhatsApp"
          className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 text-sm text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </button>
        {onAccept && (
          <TextureButton
            variant="brand"
            size="sm"
            disabled={busy}
            onClick={onAccept}
            className="!w-auto [&>div]:min-h-11 flex items-center gap-1 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> Aceptar
          </TextureButton>
        )}
        {onCancel && <TextureButton
          variant="minimal"
          size="sm"
          disabled={busy}
          onClick={onCancel}
          className="!w-auto [&>div]:min-h-11 flex items-center gap-1 disabled:opacity-50"
        >
          <Ban className="h-3.5 w-3.5" /> Cancelar
        </TextureButton>}
      </div>
    </div>
  );
}

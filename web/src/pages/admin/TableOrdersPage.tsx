import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { Check, CreditCard, Link2, Lock, LogOut, MoveHorizontal, Plus, Printer, SplitSquareHorizontal } from 'lucide-react';
import { api, getToken } from '../../api/client';
import type { FloorPlan, FloorPlanTable, Product, TableSession } from '../../types';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { ManualOrderDialog } from '@/components/admin/ManualOrderDialog';
import { EditOrderDialog, getPaymentStatus, type LiveOrder } from '@/components/admin/LiveOrdersPanel';
import { PaymentDialog } from '@/components/admin/PaymentDialog';
import { FloorPlanCanvas, SaveFloorPlanButton, saveFloorPlan, type FloorPlanPatch } from '@/components/admin/FloorPlanCanvas';
import { isAdminCashier } from '@/utils/roles';
import { useIsLandscapeTablet } from '@/hooks/useIsLandscapeTablet';
import { useConnectivity } from '@/hooks/useConnectivity';
import { SalaSidebar } from '@/components/admin/sala/SalaSidebar';
import { SalaTopBar, todayIso } from '@/components/admin/sala/SalaTopBar';
import { SeatDialog } from '@/components/admin/sala/SeatDialog';
import { NewReservationDialog } from '@/components/admin/sala/NewReservationDialog';
import { NewWaitlistDialog } from '@/components/admin/sala/NewWaitlistDialog';
import { currentMealServiceId } from '@/utils/meal-services';
import { sendWhatsappOrOpen } from '@/utils/sendWhatsapp';
import type { Reservation, WaitlistEntry, WaitlistResponse } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  NEEDS_CONFIRMATION: 'Por confirmar',
  PENDING: 'Pendiente',
  KITCHEN: 'En cocina',
  SERVED: 'Servido',
  CANCELLED: 'Cancelado',
};

export default function TableOrdersPage() {
  const { restaurant, user } = useAuth();
  const isPos = useIsLandscapeTablet();
  const connectivity = useConnectivity();
  const canAcceptOrders = user?.role !== 'KITCHEN';
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [selected, setSelected] = useState<FloorPlanTable | null>(null);
  // Mesa con varias cuentas abiertas: cuál de ellas está activa en el diálogo/footer. Null = mesa
  // libre o con una sola cuenta (en ese caso `activeSession` cae directo a `sessions[0]`).
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [liveOrders, setLiveOrders] = useState<LiveOrder[] | null>(null);
  const [editingOrder, setEditingOrder] = useState<LiveOrder | null>(null);
  const [payBeforeClosing, setPayBeforeClosing] = useState<LiveOrder | null>(null);
  const [payMode, setPayMode] = useState<'full' | 'split'>('full');
  // Botón "Cobrar": con varias cuentas abiertas, primero se elige cuál cobrar; con una sola,
  // se salta directo al paso de elegir la modalidad de pago.
  const [cobrarAccountPicker, setCobrarAccountPicker] = useState(false);
  const [cobrarModeSession, setCobrarModeSession] = useState<TableSession | null>(null);

  function load() {
    api.get('/tables/floor-plan').then((res) => setPlan(res.data.data));
  }

  /** Pedidos completos (con ítems editables, precios, etc.) para poder abrir "Editar pedido"
   * al tocar un pedido de la mesa — `plan.session.orders` solo trae un resumen de solo lectura. */
  function loadOrders() {
    api.get('/orders/live').then((res) => setLiveOrders(res.data.data));
  }

  useEffect(() => {
    load();
    loadOrders();
    loadWaitlist();
    api.get('/products').then((res) => setProducts(res.data.data));

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);
    socket.on('table:service-request', load);
    socket.on('table:service-ack', load);
    socket.on('table:merge-updated', load);
    socket.on('reservation:new', () => loadReservations());
    socket.on('reservation:updated', () => loadReservations());
    socket.on('waitlist:new', loadWaitlist);
    socket.on('waitlist:updated', loadWaitlist);
    socket.on('order:new', loadOrders);
    socket.on('order:updated', loadOrders);

    return () => {
      socket.disconnect();
    };
    // `connectivity` en las dependencias: al cambiar de destino (nube <-> relé) hay que
    // reconectar el socket, o se queda hablándole a un servidor que ya no responde.
  }, [connectivity]);

  // Plano del salón (planimetría): único modo de ver las mesas — se arma una sola vez y el resto
  // del equipo lo ve ya armado. Editarlo (mover/cambiar forma) es solo del administrador, para
  // que nadie más lo reordene sin querer mientras trabaja.
  const [editingPlan, setEditingPlan] = useState(false);
  // Cambios de plano sin guardar, por id de mesa. Viven acá (no en el lienzo) para que no se
  // pierdan al desmontarlo — ej. al cambiar de zona — mientras "Guardar plano" sigue sucio.
  const [planPatches, setPlanPatches] = useState<Record<string, FloorPlanPatch>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const canEditPlan = isAdminCashier(user?.role);
  const pendingPatches = Object.values(planPatches);
  // Unir mesas es una decisión de sala (juntar dos mesas para un grupo grande), no de
  // configuración: la toma quien atiende, igual que atender un llamado.
  const [mergingTables, setMergingTables] = useState(false);

  // --- Sala: reservas del día y lista de espera de la puerta ---
  const [salaDate, setSalaDate] = useState(todayIso());
  const [mealServiceId, setMealServiceId] = useState(() => currentMealServiceId(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistResponse | null>(null);
  // Qué se está por sentar: una reserva o alguien de la lista de espera.
  const [seating, setSeating] = useState<
    { kind: 'reservation'; reservation: Reservation } | { kind: 'waitlist'; entry: WaitlistEntry } | null
  >(null);
  const [newReservationOpen, setNewReservationOpen] = useState(false);
  const [newWaitlistOpen, setNewWaitlistOpen] = useState(false);
  const [salaBusy, setSalaBusy] = useState(false);
  const [salaError, setSalaError] = useState<string | null>(null);
  const canManageReservations = isAdminCashier(user?.role);

  function loadReservations(date = salaDate) {
    api.get('/reservations', { params: { date } }).then((res) => setReservations(res.data.data));
  }
  function loadWaitlist() {
    api.get('/waitlist').then((res) => setWaitlist(res.data.data));
  }

  /** Envuelve una acción de Sala: apaga el error viejo, marca ocupado y recarga lo que toque. */
  async function runSalaAction(fn: () => Promise<unknown>, fallback: string) {
    setSalaBusy(true);
    setSalaError(null);
    try {
      await fn();
      loadReservations();
      loadWaitlist();
      load();
      return true;
    } catch (e: any) {
      setSalaError(e.response?.data?.error ?? fallback);
      return false;
    } finally {
      setSalaBusy(false);
    }
  }

  /** Manda el mensaje por el bot si el restaurante lo tiene vinculado; si no, abre wa.me. */
  function whatsapp(phone: string, message: string) {
    const fallback = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    void sendWhatsappOrOpen(phone, message, fallback);
  }

  async function confirmSeat(tableId: string, idNumber?: string) {
    if (!seating) return;
    const ok = await runSalaAction(
      () =>
        seating.kind === 'reservation'
          ? api.patch(`/reservations/${seating.reservation.id}/seat`, { tableId })
          : api.patch(`/waitlist/${seating.entry.id}/seat`, { tableId, customerIdNumber: idNumber }),
      'No se pudo sentar.',
    );
    if (ok) setSeating(null);
  }

  async function mergeTables(
    primaryTableId: string,
    tableIds: string[],
    positions: { id: string; planX: number; planY: number }[],
  ) {
    setError(null);
    try {
      await api.post('/tables/merge', { primaryTableId, tableIds, positions });
      setMergingTables(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudieron unir las mesas.');
    }
  }

  async function unmergeTables(primaryTableId: string) {
    setError(null);
    try {
      await api.post(`/tables/${primaryTableId}/unmerge`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudieron separar las mesas.');
    }
  }

  async function persistFloorPlan() {
    setSavingPlan(true);
    setError(null);
    try {
      await saveFloorPlan(pendingPatches);
      setPlanPatches({});
      setEditingPlan(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el plano.');
    } finally {
      setSavingPlan(false);
    }
  }

  // Cambiar de día recarga solo las reservas: el plano siempre muestra AHORA.
  useEffect(() => {
    loadReservations(salaDate);
  }, [salaDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    if (!plan) return [];
    return [...plan.zones, ...(plan.unzoned.length > 0 ? [{ id: 'unzoned', name: 'Sin zona', tables: plan.unzoned }] : [])];
  }, [plan]);

  // Refresca la mesa seleccionada con los datos frescos cada vez que llega el plan.
  useEffect(() => {
    if (!selected || !plan) return;
    const fresh = sections.flatMap((s) => s.tables).find((t) => t.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras "Editar pedido" está abierto desde una mesa, lo refresca con los datos frescos que lleguen.
  useEffect(() => {
    if (!editingOrder || !liveOrders) return;
    const fresh = liveOrders.find((lo) => lo.id === editingOrder.id);
    if (fresh) setEditingOrder(fresh);
  }, [liveOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Igual, mientras el "Pagar antes de cerrar" está abierto (para reflejar el saldo tras cada abono).
  useEffect(() => {
    if (!payBeforeClosing || !liveOrders) return;
    const fresh = liveOrders.find((lo) => lo.id === payBeforeClosing.id);
    if (fresh) setPayBeforeClosing(fresh);
  }, [liveOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const freeTables = useMemo(
    () =>
      sections
        .flatMap((s) => s.tables)
        // Una mesa pegada a otra no lleva cuenta propia: rodar una cuenta hacia ella la dejaría
        // invisible dentro del grupo, así que no se ofrece como destino.
        .filter((t) => t.sessions.length === 0 && !t.mergedIntoTableId && t.id !== selected?.id),
    [sections, selected],
  );

  // Con una sola cuenta (el caso de siempre), cae directo a ella sin que el mesero tenga que elegir nada.
  const activeSession = selected ? selected.sessions.find((s) => s.id === selectedSessionId) ?? selected.sessions[0] ?? null : null;

  async function closeTable() {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${activeSession.id}/close`);
      setSelected(null);
      setEditingOrder(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cerrar la mesa.');
    } finally {
      setBusy(false);
    }
  }

  /** Pedidos de una cuenta puntual que todavía tienen saldo pendiente. */
  function getUnpaidOrdersFor(session: TableSession | null): LiveOrder[] {
    if (!session) return [];
    return session.orders
      .map((o) => liveOrders?.find((lo) => lo.id === o.orderId))
      .filter((full): full is LiveOrder => !!full && !getPaymentStatus(full).fullyPaid);
  }

  /** Pedidos de la cuenta activa (la que está seleccionada ahora mismo) con saldo pendiente. */
  function getUnpaidOrders(): LiveOrder[] {
    return getUnpaidOrdersFor(activeSession);
  }

  /** "Cerrar mesa": si algún pedido de la cuenta activa todavía no está pagado, abre "Pagar" para
   * ese pedido en vez de cerrar — no debe poder cerrarse una cuenta dejando saldo sin cobrar.
   * Si todo ya está pagado, cierra directo sin preguntar cómo se pagó. */
  function handleCerrarMesaClick() {
    const unpaid = getUnpaidOrders();
    if (unpaid.length === 0) {
      closeTable();
      return;
    }
    const current = editingOrder && unpaid.find((o) => o.id === editingOrder.id);
    setPayMode('full');
    setPayBeforeClosing(current ?? unpaid[0]);
  }

  /** "Cobrar": con varias cuentas abiertas en la mesa, primero pregunta cuál cobrar (no asume
   * que es la que está activa en pantalla); con una sola, salta directo a elegir la modalidad. */
  function openCobrar() {
    if (!selected || selected.sessions.length === 0) return;
    if (selected.sessions.length > 1) {
      setCobrarAccountPicker(true);
      return;
    }
    setCobrarModeSession(selected.sessions[0]);
  }

  function chooseCobrarAccount(session: TableSession) {
    setCobrarAccountPicker(false);
    setCobrarModeSession(session);
  }

  /** Último paso: con la cuenta ya elegida, arma qué pedido pagar (el que se está viendo si
   * tiene saldo, si no el primero pendiente) y abre "Pagar" en la modalidad elegida. */
  function chooseCobrarMode(mode: 'full' | 'split') {
    const session = cobrarModeSession;
    setCobrarModeSession(null);
    if (!session) return;
    const unpaid = getUnpaidOrdersFor(session);
    if (unpaid.length === 0) return;
    const current = editingOrder && unpaid.find((o) => o.id === editingOrder.id);
    setPayMode(mode);
    setPayBeforeClosing(current ?? unpaid[0]);
  }

  /** No imprime desde este navegador — reenvía la comanda a la estación de impresión. */
  async function printOrder(orderId: string, status: string) {
    setPrintingId(orderId);
    setError(null);
    try {
      if (status === 'PENDING' || status === 'NEEDS_CONFIRMATION') {
        // Si ya se aceptó justo antes (doble click), el 400 de "ya no está pendiente" no debe frenar la impresión.
        await api.post(`/orders/${orderId}/accept`).catch(() => {});
      }
      await api.post(`/orders/${orderId}/print-comanda`);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la comanda a la estación de impresión.');
    } finally {
      setPrintingId(null);
    }
  }

  async function acceptOrder(orderId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/orders/${orderId}/accept`);
      load();
      loadOrders();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo aceptar el pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeServiceRequest(t: FloorPlanTable) {
    try {
      await api.patch(`/tables/${t.id}/service-request/ack`);
      load();
    } catch {
      // Si falla, el aviso simplemente sigue visible y se puede reintentar.
    }
  }

  async function resetPin() {
    if (!activeSession) return;
    if (!confirm('¿Quitar la clave de esta cuenta? Cualquiera podrá pedir sin necesidad de clave hasta que se defina una nueva.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${activeSession.id}/reset-pin`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo quitar la clave.');
    } finally {
      setBusy(false);
    }
  }

  async function moveTable(newTableId: string) {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/table-sessions/${activeSession.id}/move`, { tableId: newTableId });
      setMoveOpen(false);
      setSelected(null);
      setEditingOrder(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo rodar la mesa.');
    } finally {
      setBusy(false);
    }
  }

  /** Al tocar una mesa con cuenta(s) abierta(s), muestra la más reciente por defecto y abre
   * directo "Editar pedido" del pedido más reciente de esa cuenta, sin pasar por una lista intermedia. */
  function openTable(tapped: FloorPlanTable) {
    // Mesa unida a otra: se abre la principal, que es la que lleva la cuenta del grupo.
    const t = tapped.mergedIntoTableId
      ? sections.flatMap((s) => s.tables).find((x) => x.id === tapped.mergedIntoTableId) ?? tapped
      : tapped;
    setSelected(t);
    if (t.sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    const mostRecentSession = t.sessions[t.sessions.length - 1];
    setSelectedSessionId(mostRecentSession.id);
    if (mostRecentSession.orders.length === 0) return;
    const mostRecent = [...mostRecentSession.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    const full = liveOrders?.find((lo) => lo.id === mostRecent.orderId);
    if (full) setEditingOrder(full);
  }

  /** Cambia de cuenta dentro de la misma mesa: recarga el pedido más reciente de la cuenta elegida. */
  function selectAccount(session: NonNullable<typeof activeSession>) {
    setSelectedSessionId(session.id);
    if (session.orders.length === 0) {
      setEditingOrder(null);
      return;
    }
    const mostRecent = [...session.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    const full = liveOrders?.find((lo) => lo.id === mostRecent.orderId);
    if (full) setEditingOrder(full);
  }

  function selectOrderTab(orderId: string) {
    const full = liveOrders?.find((lo) => lo.id === orderId);
    if (full) setEditingOrder(full);
  }

  /** Generar orden / Rodar mesa / Quitar clave / Cerrar mesa — se muestran tanto en el diálogo
   * de mesa (mesa libre / respaldo sin pedido cargado aún) como fijos arriba de "Editar pedido".
   * En tablet horizontal (POS) se ven como botones cuadrados en grilla en vez de píldoras apiladas. */
  function renderMesaActions() {
    if (!activeSession) return null;
    const items = [
      {
        key: 'generar',
        variant: 'brand' as const,
        onClick: () => setManualOrderOpen(true),
        disabled: busy,
        icon: Plus,
        label: 'Generar orden',
      },
      {
        key: 'cobrar',
        variant: 'success' as const,
        onClick: openCobrar,
        disabled: busy || !selected?.sessions.some((s) => getUnpaidOrdersFor(s).length > 0),
        icon: CreditCard,
        label: 'Cobrar',
      },
      {
        key: 'rodar',
        variant: 'minimal' as const,
        onClick: () => setMoveOpen(true),
        disabled: busy,
        icon: MoveHorizontal,
        label: 'Rodar mesa',
      },
      ...(activeSession.pinRequired
        ? [
            {
              key: 'clave',
              variant: 'minimal' as const,
              onClick: resetPin,
              disabled: busy,
              icon: Lock,
              label: 'Quitar clave',
            },
          ]
        : []),
      {
        key: 'cerrar',
        variant: 'destructive' as const,
        onClick: handleCerrarMesaClick,
        disabled: busy,
        icon: LogOut,
        label: 'Cerrar mesa',
      },
    ];

    if (isPos) {
      const posColorClass: Record<typeof items[number]['variant'], string> = {
        brand: 'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-800',
        success: 'bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700',
        minimal: 'bg-white border border-brand-950/10 text-brand-950 hover:bg-brand-950/5',
        destructive: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
      };
      return (
        <div className="flex gap-2">
          {items.map(({ key, variant, onClick, disabled, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={onClick}
              disabled={disabled}
              className={`flex-1 h-16 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.97] disabled:opacity-40 ${posColorClass[variant]}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-xs font-semibold leading-tight text-center">{label}</span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {items.map(({ key, variant, onClick, disabled, icon: Icon, label }) => (
          <TextureButton
            key={key}
            variant={variant}
            size="default"
            onClick={onClick}
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Icon className="h-4 w-4" /> {label}
          </TextureButton>
        ))}
      </div>
    );
  }

  /** Chips para elegir cuenta cuando la mesa tiene más de una abierta a la vez. */
  function renderAccountSwitcher() {
    if (!selected || selected.sessions.length < 2) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {selected.sessions.map((s, i) => (
          <button
            key={s.id}
            onClick={() => selectAccount(s)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              activeSession?.id === s.id ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60'
            }`}
          >
            {s.label ?? `Cuenta ${i + 1}`} · {formatBase(s.totalBase, symbol)}
          </button>
        ))}
      </div>
    );
  }

  const activeSessionOrders = activeSession?.orders ?? [];
  const mesaFooter =
    activeSession && editingOrder && editingOrder.channel === 'DINE_IN' ? (
      <>
        <p className="text-sm font-semibold text-brand-950 flex items-center gap-2">
          Mesa {selected?.number}
          {activeSession.pinRequired && (
            <span className="inline-flex items-center gap-1 text-xs text-brand-500 font-normal">
              <Lock className="h-3 w-3" /> Con clave
            </span>
          )}
        </p>
        {renderAccountSwitcher()}
        {activeSessionOrders.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {activeSessionOrders.map((o) => (
              <button
                key={o.orderId}
                onClick={() => selectOrderTab(o.orderId)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  editingOrder.id === o.orderId ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60'
                }`}
              >
                Pedido #{o.pedidoNumber}
              </button>
            ))}
          </div>
        )}
        {editingOrder.status === 'NEEDS_CONFIRMATION' && canAcceptOrders && (
          <button
            onClick={() => acceptOrder(editingOrder.id)}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:opacity-50 w-fit"
          >
            <Check className="h-3.5 w-3.5" /> Aceptar pedido
          </button>
        )}
        {renderMesaActions()}
      </>
    ) : null;

  if (!plan) {
    return <p className="text-brand-950/50 font-light">Cargando plano de mesas…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Órdenes de Mesa</h1>
        {sections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {canEditPlan && !editingPlan && !mergingTables && (
              <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setEditingPlan(true)}>
                Editar plano
              </TextureButton>
            )}
            {editingPlan && (
              <>
                <SaveFloorPlanButton dirty={pendingPatches.length > 0} saving={savingPlan} onSave={persistFloorPlan} />
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlan(false);
                    setPlanPatches({});
                    load();
                  }}
                  className="text-xs font-medium text-brand-950/50 hover:text-brand-950"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-brand-950/40 py-10 text-center font-light">
          Todavía no hay mesas creadas. Ve a Mesas / QR para crearlas.
        </p>
      )}

      {sections.length > 0 && (
        <SalaTopBar
          date={salaDate}
          onDateChange={setSalaDate}
          mealServiceId={mealServiceId}
          onMealServiceChange={setMealServiceId}
        />
      )}

      {salaError && <p className="text-sm text-red-600">{salaError}</p>}

      <div className={sections.length > 0 && isPos ? 'grid grid-cols-[320px_minmax(0,1fr)] gap-4 items-start' : 'space-y-4'}>
        {sections.length > 0 && (
          <SalaSidebar
            reservations={reservations}
            waitlist={waitlist}
            mealServiceId={mealServiceId}
            onSeatReservation={(r) => setSeating({ kind: 'reservation', reservation: r })}
            onSeatWaitlist={(e) => setSeating({ kind: 'waitlist', entry: e })}
            onNotifyWaitlist={(e) => runSalaAction(() => api.patch(`/waitlist/${e.id}/notify`), 'No se pudo avisar.')}
            onCancelWaitlist={(e) => runSalaAction(() => api.patch(`/waitlist/${e.id}/cancel`), 'No se pudo quitar de la lista.')}
            onWhatsappReservation={(r) =>
              whatsapp(r.customerPhone, `Hola ${r.customerName}, te escribimos de ${restaurant?.name ?? ''} sobre tu reserva de las ${r.time}.`)
            }
            onWhatsappWaitlist={(e) =>
              e.customerPhone && whatsapp(e.customerPhone, `Hola ${e.customerName}, ¡tu mesa en ${restaurant?.name ?? ''} está lista!`)
            }
            onNewWaitlistEntry={() => setNewWaitlistOpen(true)}
            onNewReservation={() => setNewReservationOpen(true)}
            canCreateReservation={canManageReservations}
            onOpenTable={(tableId) => {
              const table = sections.flatMap((z) => z.tables).find((t) => t.id === tableId);
              if (table) openTable(table);
            }}
          />
        )}

      <div className="rounded-3xl border border-brand-950/10 bg-white p-8 space-y-10 shadow-sm">
        {sections.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 -mt-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-brand-950/50 font-light">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0f6e46]" /> Libre
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-950" /> Ocupada
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#8a5106]" /> Piden cuenta
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#9d2469]" /> Reservada
              </span>
            </div>
            {!editingPlan &&
              (mergingTables ? (
                <button
                  type="button"
                  onClick={() => setMergingTables(false)}
                  className="text-xs font-medium text-brand-950/50 hover:text-brand-950"
                >
                  Cancelar
                </button>
              ) : (
                <TextureButton
                  variant="brand"
                  size="default"
                  className="!w-auto flex items-center gap-1.5"
                  onClick={() => setMergingTables(true)}
                >
                  <Link2 className="h-4 w-4" /> Unir mesas
                </TextureButton>
              ))}
          </div>
        )}
        {sections.map((zone) => (
          <div key={zone.id}>
            <h2 className="text-sm font-semibold text-brand-950/70 mb-4">{zone.name}</h2>
            <FloorPlanCanvas
              tables={zone.tables}
              mode={editingPlan ? 'edit' : mergingTables ? 'merge' : 'view'}
              patches={planPatches}
              onPatch={(patch) => setPlanPatches((prev) => ({ ...prev, [patch.id]: patch }))}
              onOpenTable={openTable}
              onAcknowledge={acknowledgeServiceRequest}
              onMerge={mergeTables}
              onUnmerge={unmergeTables}
            />
          </div>
        ))}
      </div>
      </div>

      <SeatDialog
        open={!!seating}
        title={seating?.kind === 'reservation' ? 'Sentar reserva' : 'Sentar de la lista de espera'}
        personName={
          seating?.kind === 'reservation' ? seating.reservation.customerName : (seating?.entry.customerName ?? '')
        }
        suggestedTableIds={seating?.kind === 'reservation' ? seating.reservation.tables.map((t) => t.id) : undefined}
        tables={sections.flatMap((z) => z.tables)}
        needsIdNumber={seating?.kind === 'waitlist'}
        busy={salaBusy}
        error={salaError}
        onSeat={confirmSeat}
        onClose={() => {
          setSeating(null);
          setSalaError(null);
        }}
      />

      <NewReservationDialog
        open={newReservationOpen}
        date={salaDate}
        tables={sections.flatMap((z) => z.tables)}
        busy={salaBusy}
        error={salaError}
        onCreate={async (input) => {
          const ok = await runSalaAction(() => api.post('/reservations', input), 'No se pudo crear la reserva.');
          if (ok) setNewReservationOpen(false);
        }}
        onClose={() => {
          setNewReservationOpen(false);
          setSalaError(null);
        }}
      />

      <NewWaitlistDialog
        open={newWaitlistOpen}
        zones={plan?.zones.map((z) => ({ id: z.id, name: z.name })) ?? []}
        busy={salaBusy}
        error={salaError}
        onCreate={async (input) => {
          const ok = await runSalaAction(() => api.post('/waitlist', input), 'No se pudo anotar en la lista.');
          if (ok) setNewWaitlistOpen(false);
        }}
        onClose={() => {
          setNewWaitlistOpen(false);
          setSalaError(null);
        }}
      />

      <Dialog open={!!selected && !editingOrder} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesa {selected?.number}</DialogTitle>
          </DialogHeader>
          {activeSession ? (
            <div className="space-y-4">
              {renderAccountSwitcher()}
              <p className="text-sm text-brand-950/70">
                <span className="font-medium text-brand-950">{activeSession.customerName}</span>
                {' · Cédula '}
                {activeSession.customerIdNumber}
                {activeSession.pinRequired && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-brand-500">
                    <Lock className="h-3 w-3" /> Con clave
                  </span>
                )}
              </p>

              <ul className="space-y-3 max-h-72 overflow-y-auto">
                {activeSession.orders.map((o) => (
                  <li
                    key={o.orderId}
                    className="border-b border-brand-950/10 pb-2 cursor-pointer -mx-1 px-1 rounded-lg hover:bg-brand-950/[0.03] transition-colors"
                    onClick={() => {
                      const full = liveOrders?.find((lo) => lo.id === o.orderId);
                      if (full) setEditingOrder(full);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-brand-950">
                        Pedido #{o.pedidoNumber}{' '}
                        <span
                          className={`font-normal ${o.status === 'NEEDS_CONFIRMATION' ? 'text-amber-600' : 'text-brand-950/40'}`}
                        >
                          · {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </p>
                      {o.status === 'NEEDS_CONFIRMATION' && canAcceptOrders && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            acceptOrder(o.orderId);
                          }}
                          disabled={busy}
                          className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:opacity-50"
                        >
                          Aceptar pedido
                        </button>
                      )}
                    </div>
                    <ul className="text-sm space-y-1 font-light mt-1">
                      {o.items.map((it, i) => (
                        <li key={i}>
                          <span className="font-medium">{it.quantity}x</span> {it.name}
                          {it.variantName && <span className="text-brand-950/50"> ({it.variantName})</span>}
                          {it.modifiers.length > 0 && (
                            <span className="text-brand-950/50"> ({it.modifiers.join(', ')})</span>
                          )}
                          {it.note && <span className="block text-xs text-brand-950/50">Nota: {it.note}</span>}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          printOrder(o.orderId, o.status);
                        }}
                        disabled={printingId === o.orderId}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-brand-950/[0.06] text-brand-950/70 hover:bg-brand-950/10 disabled:opacity-50"
                      >
                        <Printer className="h-3.5 w-3.5" /> {printingId === o.orderId ? 'Enviando…' : 'Imprimir comanda'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {renderMesaActions()}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-brand-950/40 font-light">Esta mesa está libre.</p>
              <TextureButton
                variant="brand"
                size="default"
                onClick={() => setManualOrderOpen(true)}
                className="flex items-center justify-center gap-1.5"
              >
                <Plus className="h-4 w-4" /> Generar orden
              </TextureButton>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rodar mesa {selected?.number} a…</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
            {freeTables.map((t) => (
              <button
                key={t.id}
                onClick={() => moveTable(t.id)}
                disabled={busy}
                className="aspect-square rounded-xl bg-brand-950/[0.06] hover:bg-brand-950/10 flex items-center justify-center font-medium text-sm text-brand-950 disabled:opacity-50"
              >
                {t.number}
              </button>
            ))}
            {freeTables.length === 0 && (
              <p className="col-span-4 text-sm text-brand-950/40 font-light text-center py-4">
                No hay otras mesas libres.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cobrarAccountPicker} onOpenChange={setCobrarAccountPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Qué cuenta vas a cobrar?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selected?.sessions.map((s, i) => {
              const unpaidCount = getUnpaidOrdersFor(s).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={unpaidCount === 0}
                  onClick={() => chooseCobrarAccount(s)}
                  className="w-full flex items-center justify-between gap-2 rounded-xl border border-brand-950/10 px-4 py-3 text-left hover:border-brand-400 hover:bg-brand-500/5 transition-colors disabled:opacity-40 disabled:hover:border-brand-950/10 disabled:hover:bg-transparent"
                >
                  <span className="font-medium text-brand-950">{s.label ?? `Cuenta ${i + 1}`}</span>
                  <span className="text-sm text-brand-950/50">
                    {unpaidCount === 0 ? 'Pagada' : formatBase(s.totalBase, symbol)}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cobrarModeSession} onOpenChange={(o) => !o && setCobrarModeSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cómo va a pagar?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => chooseCobrarMode('full')}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-brand-950/10 px-4 py-5 text-center hover:border-brand-400 hover:bg-brand-500/5 transition-colors"
            >
              <CreditCard className="h-5 w-5 text-brand-950/70" />
              <span className="text-sm font-medium text-brand-950">Pago único</span>
            </button>
            <button
              type="button"
              onClick={() => chooseCobrarMode('split')}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-brand-950/10 px-4 py-5 text-center hover:border-brand-400 hover:bg-brand-500/5 transition-colors"
            >
              <SplitSquareHorizontal className="h-5 w-5 text-brand-950/70" />
              <span className="text-sm font-medium text-brand-950">Pago fraccionado</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {manualOrderOpen && selected && (
        <ManualOrderDialog
          tableId={selected.id}
          tableNumber={selected.number}
          sessions={selected.sessions}
          products={products}
          onClose={() => setManualOrderOpen(false)}
          onCreated={load}
        />
      )}

      {editingOrder && (
        <EditOrderDialog
          order={editingOrder}
          context="mesa"
          onClose={() => {
            setEditingOrder(null);
            setSelected(null);
          }}
          onSaved={() => {
            load();
            loadOrders();
          }}
          mesaFooter={mesaFooter}
        />
      )}

      {payBeforeClosing && (
        <PaymentDialog
          order={payBeforeClosing}
          mode={payMode}
          onClose={() => {
            setPayBeforeClosing(null);
            setPayMode('full');
          }}
          onPaid={() => {
            load();
            loadOrders();
          }}
        />
      )}
    </div>
  );
}

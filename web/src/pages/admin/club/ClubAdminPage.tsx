import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, HandCoins, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/types';
import { ExpenseFormDialog } from '@/components/admin/ExpenseFormDialog';
import { CashSessionControl } from '@/components/admin/CashSessionControl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import ClubPayablesPage from './ClubPayablesPage';
import ClubOccupancyPage from './ClubOccupancyPage';
import ClubCustomersPage from './ClubCustomersPage';
import ClubConsumptionPage from './ClubConsumptionPage';
import ClubPayrollPage from './ClubPayrollPage';
import { clubApi, todayCaracas, type ClubBooking } from './clubApi';
import { clubStoreApi, type StoreSale } from './clubStoreApi';
import { academyApi } from './academia/academyApi';
import { card } from './clubStyle';

interface Props {
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
  canSeeMoney: boolean;
}

interface Movement {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  createdAt: string;
}

/** /movements devuelve los totales ya calculados junto al listado — se usan esos
 *  en vez de volver a sumarlos acá, para no arrastrar otro criterio de redondeo. */
interface MovementsResponse {
  totalExpense: string;
  totalIncome: string;
  movements: Movement[];
}

const TAB_LABELS: Record<string, string> = {
  resumen: 'Resumen',
  deudas: 'Deudas',
  ocupacion: 'Ocupación',
  clientes: 'Clientes',
  consumo: 'Consumo',
  cuentas: 'Cuentas por pagar',
  nomina: 'Nómina',
};

/** Ingresos por método de pago y por origen (cancha/tienda/academia). Lo calcula
 *  el backend con el mismo criterio que el arqueo — ver finance() en
 *  club-stats.service.ts — para que Caja y Resumen nunca digan cifras distintas. */
interface Finance {
  totalBase: string;
  bySource: { key: string; label: string; amountBase: string; count: number }[];
  byMethod: { method: string; label: string; amountBase: string }[];
}

interface DebtRow {
  id: string;
  /** Solo viene en las filas de academia: el cobro de una mensualidad se registra
   *  contra el alumno, no contra la cuota. */
  studentId?: string;
  name: string;
  phone: string | null;
  detail: string;
  dueBase: string;
  paidBase: string;
  balanceBase: string;
  overdue?: boolean;
}

type DebtSource = 'bookings' | 'store' | 'academy';

interface Debts {
  bookings: DebtRow[];
  store: DebtRow[];
  academy: DebtRow[];
  totals: { bookings: string; store: string; academy: string; total: string; count: number };
}

const SOURCE_COLORS: Record<string, string> = {
  court: 'bg-brand-500',
  store: 'bg-violet-500',
  academy: 'bg-sky-500',
};

const METRIC_COLORS: Record<string, string> = {
  court: 'bg-brand-500/10 text-brand-600',
  store: 'bg-violet-100 text-violet-700',
  total: 'bg-emerald-100 text-emerald-700',
  expense: 'bg-amber-100 text-amber-700',
};

/** Dónde entra y sale el dinero del club: canchas, tienda y gastos. */
export default function ClubAdminPage({ restaurant, canSeeMoney }: Props) {
  const [bookings, setBookings] = useState<ClubBooking[] | null>(null);
  const [sales, setSales] = useState<StoreSale[]>([]);
  const [ledger, setLedger] = useState<MovementsResponse | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [debts, setDebts] = useState<Debts | null>(null);
  const [collecting, setCollecting] = useState<{ source: DebtSource; row: DebtRow } | null>(null);
  const [tab, setTab] = useState<'resumen' | 'deudas' | 'ocupacion' | 'clientes' | 'consumo' | 'cuentas' | 'nomina'>(
    'resumen',
  );
  const { show, toastMessage } = useToast();

  const load = useCallback(() => {
    clubApi.listBookings({ date: todayCaracas() }).then(setBookings).catch(() => setBookings([]));
    clubStoreApi.state().then((s) => setSales(s.sales)).catch(() => setSales([]));
    api
      .get('/movements', { params: { range: 'month' } })
      .then((r) => setLedger(r.data.data))
      .catch(() => setLedger(null));
    api
      .get('/club/stats/finance', { params: { days: 30 } })
      .then((r) => setFinance(r.data.data))
      .catch(() => setFinance(null));
    api
      .get('/club/stats/debts')
      .then((r) => setDebts(r.data.data))
      .catch(() => setDebts(null));
  }, []);

  useEffect(load, [load]);

  const money = (n: number) => formatBase(n, restaurant.currencySymbol);
  const moneyBs = (n: number) => (restaurant.exchangeRate ? formatBs(n, restaurant.exchangeRate.rateBs) : null);

  const courtsToday = (bookings ?? []).filter((b) => b.status !== 'CANCELLED');
  const courtsIncome = courtsToday.reduce((acc, b) => acc + Number(b.totalBase), 0);
  const storeToday = sales.filter((s) => !s.returned && new Date(s.time).toDateString() === new Date().toDateString());
  const storeIncome = storeToday.reduce((acc, s) => acc + s.total, 0);
  const movements = ledger?.movements ?? [];
  const expensesMonth = Number(ledger?.totalExpense ?? 0);
  const noShows = (bookings ?? []).filter((b) => b.status === 'NO_SHOW').length;

  if (!canSeeMoney) {
    return (
      <div className={cn(card, 'p-8 text-center')}>
        <p className="font-semibold text-brand-950">Solo para administración</p>
        <p className="mt-1 text-[13px] font-light text-brand-950/50">Pídele acceso al dueño del club.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-bold tracking-tight text-brand-950">Administración</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Cuenta canchas + tienda del turno (ver collectPayments en cash-session.service.ts). */}
          {canSeeMoney && <CashSessionControl />}
          <button
            onClick={() => setExpenseOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-brand-500/90"
          >
            <Receipt className="h-4 w-4" />
            Gasto
          </button>
        </div>
      </div>

      {/* Sub-pestañas: el dock del club ya está en su máximo de 5 iconos (ver ClubLayout),
          así que lo administrativo nuevo vive acá adentro en vez de pedir otro icono.
          El scroll va en un contenedor APARTE de la píldora: con `overflow-x-auto` sobre la
          píldora misma nunca se activaba —al ser de ancho automático siempre "cabe"— y en su
          lugar estiraba la página, que en un celular se podía arrastrar 245px de lado. */}
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {(['resumen', 'deudas', 'ocupacion', 'clientes', 'consumo', 'cuentas', 'nomina'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                tab === t ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {TAB_LABELS[t]}
              {/* El contador va en la pestaña: si hay gente debiendo, tiene que verse
                  sin entrar a buscarlo. */}
              {t === 'deudas' && debts && debts.totals.count > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {debts.totals.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'deudas' &&
        (!debts ? (
          <p className="text-[13px] font-light text-brand-950/45">Cargando deudas…</p>
        ) : debts.totals.count === 0 ? (
          <div className={cn(card, 'p-8 text-center')}>
            <p className="font-semibold text-brand-950">Nadie debe nada</p>
            <p className="mt-1 text-[13px] font-light text-brand-950/50">
              Cuando quede una reserva, una venta fiada o una mensualidad sin cobrar, aparece acá.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className={cn(card, 'grid grid-cols-3 gap-3 p-5 text-center')}>
              <DebtTotal label="Canchas" value={money(Number(debts.totals.bookings))} />
              <DebtTotal label="Tienda" value={money(Number(debts.totals.store))} />
              <DebtTotal label="Academia" value={money(Number(debts.totals.academy))} />
            </div>

            <DebtList
              title="Reservas sin pagar"
              rows={debts.bookings}
              money={money}
              onCollect={(row) => setCollecting({ source: 'bookings', row })}
            />
            <DebtList
              title="Ventas fiadas en tienda"
              rows={debts.store}
              money={money}
              onCollect={(row) => setCollecting({ source: 'store', row })}
            />
            <DebtList
              title="Mensualidades de academia"
              rows={debts.academy}
              money={money}
              onCollect={(row) => setCollecting({ source: 'academy', row })}
            />
          </div>
        ))}

      {collecting && (
        <DebtPaymentDialog
          source={collecting.source}
          row={collecting.row}
          symbol={restaurant.currencySymbol}
          onClose={() => setCollecting(null)}
          onPaid={() => {
            setCollecting(null);
            load();
          }}
        />
      )}

      {tab === 'ocupacion' && <ClubOccupancyPage restaurant={restaurant} />}
      {tab === 'clientes' && <ClubCustomersPage restaurant={restaurant} />}
      {tab === 'consumo' && <ClubConsumptionPage restaurant={restaurant} />}
      {tab === 'nomina' && <ClubPayrollPage restaurant={restaurant} />}
      {tab === 'cuentas' && <ClubPayablesPage restaurant={restaurant} />}

      {tab === 'resumen' && (
      <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Metric
          icon={CalendarCheck}
          color={METRIC_COLORS.court}
          label="Canchas hoy"
          value={money(courtsIncome)}
          sub={`${courtsToday.length} reservas`}
        />
        <Metric
          icon={ShoppingBag}
          color={METRIC_COLORS.store}
          label="Tienda hoy"
          value={money(storeIncome)}
          sub={`${storeToday.length} ventas`}
        />
        <Metric
          icon={TrendingUp}
          color={METRIC_COLORS.total}
          label="Total hoy"
          value={money(courtsIncome + storeIncome)}
          sub={moneyBs(courtsIncome + storeIncome) ?? ''}
        />
        <Metric
          icon={Wallet}
          color={METRIC_COLORS.expense}
          label="Gastos del mes"
          value={money(expensesMonth)}
          sub={`${movements.length} movimientos`}
        />
        {/* Deudas: canchas + tienda fiada + mensualidades de academia, en una sola
            cifra. Ocupa el ancho completo porque es la que hace actuar a recepción. */}
        {debts && (
          <button
            type="button"
            onClick={() => setTab('deudas')}
            className={cn(
              card,
              'col-span-2 flex items-center gap-3 p-4 text-left transition-colors lg:col-span-4',
              Number(debts.totals.total) > 0 ? 'hover:border-amber-300' : '',
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                Number(debts.totals.total) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
              )}
            >
              <HandCoins className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[19px] font-bold leading-none tracking-tight text-brand-950">
                {money(Number(debts.totals.total))}
              </p>
              <p className="mt-1.5 text-[12px] font-medium text-brand-950/50">Deudas de clientes</p>
              <p className="text-[11px] font-light text-brand-950/35">
                {debts.totals.count === 0
                  ? 'Nadie debe. Bien.'
                  : `${debts.totals.count} cliente(s) por cobrar · toca para ver`}
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Métodos de pago: cómo pagó el cliente y cuánto entró por cada vía. */}
      {finance && Number(finance.totalBase) > 0 && (
        <section>
          <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">Métodos de pago · últimos 30 días</h2>
          <div className={cn(card, 'divide-y divide-brand-950/[0.06] overflow-hidden')}>
            {finance.byMethod.map((m) => {
              const pct = (Number(m.amountBase) / Number(finance.totalBase)) * 100;
              return (
                <div key={m.method} className="p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-medium text-brand-950">{m.label}</span>
                    <span className="shrink-0 text-[14px] font-bold text-brand-950">{money(Number(m.amountBase))}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-950/[0.06]">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 text-[11px] font-light text-brand-950/40">{Math.round(pct)}%</span>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between bg-brand-950/[0.03] p-3.5">
              <span className="text-[13px] font-semibold text-brand-950/70">Total cobrado</span>
              <span className="text-[15px] font-bold text-brand-950">{money(Number(finance.totalBase))}</span>
            </div>
          </div>
        </section>
      )}

      {/* De dónde viene la plata: la pregunta que el resumen no respondía. */}
      {finance && Number(finance.totalBase) > 0 && (
        <section>
          <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">De dónde vienen los ingresos</h2>
          <div className={cn(card, 'p-5')}>
            <div className="flex h-2.5 overflow-hidden rounded-full">
              {finance.bySource.map((s) => {
                const pct = (Number(s.amountBase) / Number(finance.totalBase)) * 100;
                return pct > 0 ? (
                  <div key={s.key} className={cn('h-full', SOURCE_COLORS[s.key])} style={{ width: `${pct}%` }} />
                ) : null;
              })}
            </div>
            <div className="mt-3 space-y-2">
              {finance.bySource.map((s) => (
                <div key={s.key} className="flex items-center gap-2.5">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', SOURCE_COLORS[s.key])} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-brand-950">{s.label}</span>
                  <span className="shrink-0 text-[11px] font-light text-brand-950/40">{s.count} cobro(s)</span>
                  <span className="shrink-0 text-[14px] font-bold text-brand-950">{money(Number(s.amountBase))}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Antes había acá una lista "Cuentas abiertas en tienda" que mostraba el TOTAL de la
          venta fiada, no el saldo: una venta de $50 con $20 ya abonados aparecía como $50 por
          cobrar, contradiciendo a la casilla de Deudas que dice $30. Se eliminó en vez de
          arreglarla porque la pestaña Deudas ya cubre lo mismo, con el saldo correcto y además
          el detalle de cuánto abonó — el saldo real solo se puede calcular en el backend, que
          es el único que ve `amountPaidNow` y los abonos posteriores. */}

      <section>
        <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">Hoy en canchas</h2>
        <div className={cn(card, 'grid grid-cols-3 gap-3 p-5 text-center')}>
          <Stat value={courtsToday.filter((b) => b.status === 'COMPLETED').length} label="jugadas" />
          <Stat value={courtsToday.filter((b) => b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT').length} label="por jugar" />
          <Stat value={noShows} label="ausencias" tone={noShows > 0 ? 'warn' : undefined} />
        </div>
      </section>

      <section>
        <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">Últimos gastos</h2>
        {movements.filter((m) => m.type === 'EXPENSE').length === 0 ? (
          <p className={cn(card, 'p-5 text-center text-[13px] font-light text-brand-950/45')}>Sin gastos registrados.</p>
        ) : (
          <div className={cn(card, 'divide-y divide-brand-950/[0.06] overflow-hidden')}>
            {movements
              .filter((m) => m.type === 'EXPENSE')
              .slice(0, 6)
              .map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-brand-950">{m.description}</p>
                    <p className="text-[12px] font-light text-brand-950/40">
                      {new Date(m.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <p className="shrink-0 text-[14px] font-bold text-brand-950">−{money(Number(m.amountBase))}</p>
                </div>
              ))}
          </div>
        )}
      </section>
      </>
      )}

      {expenseOpen && (
        <ExpenseFormDialog
          onClose={() => setExpenseOpen(false)}
          onCreated={() => {
            setExpenseOpen(false);
            load();
            show('Gasto registrado.');
          }}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  );
}

function Metric({
  icon: Icon,
  color,
  label,
  value,
  sub,
}: {
  icon: typeof Wallet;
  color: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className={cn(card, 'p-4')}>
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', color)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="mt-3 text-[19px] font-bold leading-none tracking-tight text-brand-950">{value}</p>
      <p className="mt-1.5 text-[12px] font-medium text-brand-950/50">{label}</p>
      {sub && <p className="text-[11px] font-light text-brand-950/35">{sub}</p>}
    </div>
  );
}

function DebtTotal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[18px] font-bold tracking-tight text-brand-950">{value}</p>
      <p className="text-[12px] font-light text-brand-950/45">{label}</p>
    </div>
  );
}

/** Un bloque de deudas. Se oculta solo si está vacío, para no dejar tres títulos
 *  con "nada por acá" cuando la deuda viene de una sola fuente. Cada fila es un
 *  botón: tocar a la persona abre la pasarela de pago para abonarle ahí mismo,
 *  sin tener que ir a buscarla a Canchas, Tienda o Academia. */
function DebtList({
  title,
  rows,
  money,
  onCollect,
}: {
  title: string;
  rows: DebtRow[];
  money: (n: number) => string;
  onCollect: (row: DebtRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">{title}</h2>
      <div className={cn(card, 'divide-y divide-brand-950/[0.06] overflow-hidden')}>
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onCollect(r)}
            className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-brand-950/[0.03]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-brand-950">
                {r.name}
                {r.overdue && (
                  <span className="ml-1.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                    VENCIDA
                  </span>
                )}
              </p>
              <p className="truncate text-[12px] font-light text-brand-950/45">
                {r.detail}
                {r.phone && ` · ${r.phone}`}
              </p>
              {Number(r.paidBase) > 0 && (
                <p className="text-[11px] font-light text-brand-950/35">
                  abonó {money(Number(r.paidBase))} de {money(Number(r.dueBase))}
                </p>
              )}
            </div>
            <p className="shrink-0 text-[15px] font-bold text-amber-700">{money(Number(r.balanceBase))}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

const DEBT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH_USD', label: 'Efectivo $' },
  { value: 'CASH', label: 'Efectivo Bs' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'CARD', label: 'Punto de venta' },
  { value: 'BINANCE', label: 'Binance' },
  { value: 'PAYPAL', label: 'PayPal' },
];

const DEBT_SOURCE_LABEL: Record<DebtSource, string> = {
  bookings: 'reserva de cancha',
  store: 'venta de tienda',
  academy: 'mensualidad de academia',
};

/**
 * La misma pasarela de pago para las tres fuentes de deuda del club. Cada una
 * cuelga de un endpoint distinto (una reserva, una venta fiada, una mensualidad),
 * así que el único trabajo de este diálogo es apuntar al correcto — el saldo, el
 * monto y los métodos se ven y se cobran igual sin importar de dónde vino.
 */
function DebtPaymentDialog({
  source,
  row,
  symbol,
  onClose,
  onPaid,
}: {
  source: DebtSource;
  row: DebtRow;
  symbol: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const balance = Number(row.balanceBase);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('CASH_USD');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return setError('Escribe un monto mayor a 0.');
    if (n > balance + 0.01) return setError(`No puede superar el saldo pendiente (${formatBase(balance, symbol)}).`);
    setSaving(true);
    setError(null);
    try {
      if (source === 'bookings') {
        await clubApi.addBookingPayment(row.id, {
          amountBase: n,
          method,
          referenceNumber: reference.trim() || undefined,
        });
      } else if (source === 'academy') {
        if (!row.studentId) throw new Error('missing studentId');
        await academyApi.recordPayment({
          studentId: row.studentId,
          kind: 'MONTHLY',
          chargeId: row.id,
          amountBase: n,
          method,
          referenceNumber: reference.trim() || null,
        });
      } else {
        // La venta fiada corre sobre el backend de Tienda: ese endpoint guarda el
        // método como texto libre, no como el enum de Canchas/Academia.
        await api.post(`/shop/sales/${row.id}/payments`, {
          amount: n,
          method: DEBT_METHODS.find((m) => m.value === method)?.label,
        });
      }
      setDone(true);
      setTimeout(onPaid, 700);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el pago.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cobrar a {row.name}</DialogTitle>
        </DialogHeader>

        {done ? (
          <p className="py-4 text-center text-sm font-semibold text-emerald-700">
            ✓ Pago de {formatBase(amount, symbol)} registrado
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-brand-950/[0.04] px-3 py-2.5 text-sm">
              <p className="text-brand-950/60">{DEBT_SOURCE_LABEL[source]}</p>
              <p className="mt-0.5 font-medium text-brand-950">{row.detail}</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Monto ({symbol})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
              />
              <span className="mt-1 block text-[11px] font-light text-brand-950/40">
                Saldo pendiente: {formatBase(balance, symbol)}
              </span>
            </label>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-brand-950/70">Cómo pagó</span>
              <div className="flex flex-wrap gap-1.5">
                {DEBT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      method === m.value
                        ? 'bg-brand-500 text-white'
                        : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {source !== 'store' && (
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Referencia</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                />
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
              {saving ? 'Registrando…' : `Cobrar ${formatBase(amount || '0', symbol)}`}
            </TextureButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'warn' }) {
  return (
    <div>
      <p className={cn('text-[22px] font-bold tracking-tight', tone === 'warn' ? 'text-amber-600' : 'text-brand-950')}>
        {value}
      </p>
      <p className="text-[12px] font-light text-brand-950/45">{label}</p>
    </div>
  );
}

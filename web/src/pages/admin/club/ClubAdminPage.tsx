import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { ExpenseFormDialog } from '@/components/admin/ExpenseFormDialog';
import { CashSessionControl } from '@/components/admin/CashSessionControl';
import ClubPayablesPage from './ClubPayablesPage';
import ClubOccupancyPage from './ClubOccupancyPage';
import ClubCustomersPage from './ClubCustomersPage';
import ClubConsumptionPage from './ClubConsumptionPage';
import ClubPayrollPage from './ClubPayrollPage';
import { clubApi, todayCaracas, type ClubBooking } from './clubApi';
import { clubStoreApi, type StoreSale } from './clubStoreApi';
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
  ocupacion: 'Ocupación',
  clientes: 'Clientes',
  consumo: 'Consumo',
  cuentas: 'Cuentas por pagar',
  nomina: 'Nómina',
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
  const [tab, setTab] = useState<'resumen' | 'ocupacion' | 'clientes' | 'consumo' | 'cuentas' | 'nomina'>('resumen');
  const { show, toastMessage } = useToast();

  const load = useCallback(() => {
    clubApi.listBookings({ date: todayCaracas() }).then(setBookings).catch(() => setBookings([]));
    clubStoreApi.state().then((s) => setSales(s.sales)).catch(() => setSales([]));
    api
      .get('/movements', { params: { range: 'month' } })
      .then((r) => setLedger(r.data.data))
      .catch(() => setLedger(null));
  }, []);

  useEffect(load, [load]);

  const money = (n: number) => formatBase(n, restaurant.currencySymbol);
  const moneyBs = (n: number) => (restaurant.exchangeRate ? formatBs(n, restaurant.exchangeRate.rateBs) : null);

  const courtsToday = (bookings ?? []).filter((b) => b.status !== 'CANCELLED');
  const courtsIncome = courtsToday.reduce((acc, b) => acc + Number(b.totalBase), 0);
  const storeToday = sales.filter((s) => !s.returned && new Date(s.time).toDateString() === new Date().toDateString());
  const storeIncome = storeToday.reduce((acc, s) => acc + s.total, 0);
  const openTabs = sales.filter((s) => !s.returned && s.creditTerms && !s.settledAt);
  const openTabsTotal = openTabs.reduce((acc, s) => acc + s.total, 0);
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
          así que lo administrativo nuevo vive acá adentro en vez de pedir otro icono. */}
      <div className="flex items-center gap-1 self-start overflow-x-auto rounded-full bg-brand-950/[0.05] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(['resumen', 'ocupacion', 'clientes', 'consumo', 'cuentas', 'nomina'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              tab === t ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'ocupacion' && <ClubOccupancyPage restaurant={restaurant} />}
      {tab === 'clientes' && <ClubCustomersPage restaurant={restaurant} />}
      {tab === 'consumo' && <ClubConsumptionPage restaurant={restaurant} />}
      {tab === 'nomina' && <ClubPayrollPage restaurant={restaurant} />}
      {tab === 'cuentas' && <ClubPayablesPage restaurant={restaurant} />}

      {tab === 'resumen' && (
      <>
      <div className="grid grid-cols-2 gap-3">
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
      </div>

      {openTabs.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">Cuentas abiertas en tienda</h2>
          <div className={cn(card, 'divide-y divide-brand-950/[0.06] overflow-hidden')}>
            {openTabs.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-brand-950">{s.customerName ?? 'Sin nombre'}</p>
                  <p className="text-[12px] font-light text-brand-950/45">
                    {s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ') || '—'}
                  </p>
                </div>
                <p className="shrink-0 text-[14px] font-bold text-brand-950">{money(s.total)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between bg-amber-50 p-3.5">
              <span className="text-[13px] font-semibold text-amber-900">Total por cobrar</span>
              <span className="text-[15px] font-bold text-amber-900">{money(openTabsTotal)}</span>
            </div>
          </div>
        </section>
      )}

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

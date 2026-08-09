import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase, formatBs } from '@/utils/format';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { ExpenseFormDialog } from '@/components/admin/ExpenseFormDialog';
import { clubApi, todayCaracas, type ClubBooking } from './clubApi';
import { clubStoreApi, type StoreSale } from './clubStoreApi';
import { glass } from './clubStyle';

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

/** Dónde entra y sale el dinero del club: canchas, tienda y gastos. */
export default function ClubAdminPage({ restaurant, canSeeMoney }: Props) {
  const [bookings, setBookings] = useState<ClubBooking[] | null>(null);
  const [sales, setSales] = useState<StoreSale[]>([]);
  const [ledger, setLedger] = useState<MovementsResponse | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
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
      <div className={cn(glass, 'p-8 text-center')}>
        <p className="font-semibold text-white">Solo para administración</p>
        <p className="mt-1 text-[13px] font-light text-white/60">Pídele acceso al dueño del club.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-[24px] font-bold tracking-tight text-white">Administración</h1>
        <button
          onClick={() => setExpenseOpen(true)}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-brand-950 shadow-lg"
        >
          <Receipt className="h-4 w-4" />
          Gasto
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric
          icon={CalendarCheck}
          label="Canchas hoy"
          value={money(courtsIncome)}
          sub={`${courtsToday.length} reservas`}
        />
        <Metric
          icon={ShoppingBag}
          label="Tienda hoy"
          value={money(storeIncome)}
          sub={`${storeToday.length} ventas`}
        />
        <Metric
          icon={TrendingUp}
          label="Total hoy"
          value={money(courtsIncome + storeIncome)}
          sub={moneyBs(courtsIncome + storeIncome) ?? ''}
        />
        <Metric icon={Wallet} label="Gastos del mes" value={money(expensesMonth)} sub={`${movements.length} movimientos`} />
      </div>

      {openTabs.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[14px] font-bold text-white">Cuentas abiertas en tienda</h2>
          <div className={cn(glass, 'divide-y divide-white/10 overflow-hidden')}>
            {openTabs.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-white">{s.customerName ?? 'Sin nombre'}</p>
                  <p className="text-[12px] font-light text-white/55">
                    {s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ') || '—'}
                  </p>
                </div>
                <p className="shrink-0 text-[14px] font-bold text-white">{money(s.total)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between bg-amber-400/15 p-3.5">
              <span className="text-[13px] font-semibold text-white">Total por cobrar</span>
              <span className="text-[15px] font-bold text-white">{money(openTabsTotal)}</span>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2.5 text-[14px] font-bold text-white">Hoy en canchas</h2>
        <div className={cn(glass, 'grid grid-cols-3 gap-3 p-5 text-center')}>
          <Stat value={courtsToday.filter((b) => b.status === 'COMPLETED').length} label="jugadas" />
          <Stat value={courtsToday.filter((b) => b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT').length} label="por jugar" />
          <Stat value={noShows} label="ausencias" tone={noShows > 0 ? 'warn' : undefined} />
        </div>
      </section>

      <section>
        <h2 className="mb-2.5 text-[14px] font-bold text-white">Últimos gastos</h2>
        {movements.filter((m) => m.type === 'EXPENSE').length === 0 ? (
          <p className={cn(glass, 'p-5 text-center text-[13px] font-light text-white/55')}>Sin gastos registrados.</p>
        ) : (
          <div className={cn(glass, 'divide-y divide-white/10 overflow-hidden')}>
            {movements
              .filter((m) => m.type === 'EXPENSE')
              .slice(0, 6)
              .map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-white">{m.description}</p>
                    <p className="text-[12px] font-light text-white/50">
                      {new Date(m.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <p className="shrink-0 text-[14px] font-bold text-white">−{money(Number(m.amountBase))}</p>
                </div>
              ))}
          </div>
        )}
      </section>

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
  label,
  value,
  sub,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className={cn(glass, 'p-4')}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <p className="mt-3 text-[19px] font-bold leading-none tracking-tight text-white">{value}</p>
      <p className="mt-1.5 text-[12px] font-medium text-white/60">{label}</p>
      {sub && <p className="text-[11px] font-light text-white/40">{sub}</p>}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'warn' }) {
  return (
    <div>
      <p className={cn('text-[22px] font-bold tracking-tight', tone === 'warn' ? 'text-amber-200' : 'text-white')}>
        {value}
      </p>
      <p className="text-[12px] font-light text-white/55">{label}</p>
    </div>
  );
}

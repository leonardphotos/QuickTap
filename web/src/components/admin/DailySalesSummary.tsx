import { api,getToken } from '@/api/client';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import type { Currency,PaymentMethod } from '@/types';
import { apiOrigin } from '@/utils/apiOrigin';
import { CURRENCY_SYMBOLS,formatBase,formatBsAbsolute } from '@/utils/format';
import { Plus } from 'lucide-react';
import { useEffect,useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { ExpenseFormDialog } from './ExpenseFormDialog';
import { CATEGORY_LABELS,type ExpenseCategory } from './ExpenseFormDialog.shared';
import { IncomeFormDialog } from './IncomeFormDialog';
import { INCOME_CATEGORY_LABELS,type IncomeCategory } from './IncomeFormDialog.shared';
import { PAYMENT_LABELS } from './PaymentDialog.shared';
import { useAuth } from '@/context/AuthContext.shared';

interface TodaySummary {
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  currency: Currency;
  byChannel: { DINE_IN: number; DELIVERY: number; PICKUP: number; BAR: number; EXPRESS: number };
  ingresosBase: string;
  ingresosBs: string;
  egresosBase: string;
  egresosBs: string;
  balanceBase: string;
  balanceBs: string;
}

interface MovementRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  category: ExpenseCategory | null;
  incomeCategory: IncomeCategory | null;
  paymentMethod: PaymentMethod | null;
  supplier: { id: string; name: string } | null;
  inventoryItem: { id: string; name: string } | null;
  inventoryQuantity: string | null;
  isCredit: boolean;
  creditPaidAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

const CHANNEL_LABEL: Record<string, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Retiro', BAR: 'Barra', EXPRESS: 'Express' };

/** Resumen de ventas del día (hora de Caracas) en el Dashboard del restaurante. En celular es
 * una tarjeta compacta de 3 columnas; en pantallas anchas se desglosa hacia abajo (Balance,
 * Ingresos, Egresos) y debajo se agregan "Añadir egreso" y los últimos movimientos — todo
 * dentro de la columna fija (estática) del Dashboard, mientras las comandas se desplazan aparte. */
export function DailySalesSummary() {
  const { restaurant,user } = useAuth();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<MovementRow | null>(null);

  function load() {
    api.get('/orders/summary/today').then((res) => setSummary(res.data.data));
  }

  function loadMovements() {
    api
      .get('/movements', { params: { range: 'all' } })
      .then((res) => setMovements((res.data.data.movements as MovementRow[]).slice(0, 10)))
      .catch(() => setMovements([]));
  }

  useEffect(() => {
    load();
    loadMovements();

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!summary) return null;

  const symbol = CURRENCY_SYMBOLS[summary.currency];
  const channels = Object.entries(summary.byChannel).filter(([, count]) => count > 0);
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'equipo';

  return (
    <div className="w-full">
      {/* Celular: tarjeta "Ventas de hoy" — fondo azul de marca a pantalla completa, con
          el desglose Balance/Ingresos/Egresos abajo, todo dentro de la misma ventana. */}
      <div className="qt-calm-mobile-summary relative lg:hidden w-full mb-4 overflow-hidden rounded-[29px] bg-gradient-to-br from-brand-500 via-[#3278ff] to-[#5134e8] shadow-[0_16px_34px_rgba(31,93,230,0.22)] px-5 py-5 text-left">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
        <div className="relative flex items-center justify-between mb-5 gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={restaurant?.logoUrl || '/logo/icono.png?v=20261002'} alt="" className="h-10 w-10 shrink-0 rounded-2xl border border-white/35 bg-white/90 object-cover" />
            <div className="min-w-0">
              <p className="font-medium text-white/70 text-xs">Buen día</p>
              <p className="truncate font-semibold tracking-[-0.025em] text-white text-base">{firstName}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Añadir egreso"
              onClick={() => setShowExpenseDialog(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-amber-200 active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Añadir ingreso"
              onClick={() => setShowIncomeDialog(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="relative font-medium text-white/72 text-xs">Ventas de hoy</p>
        <div className="relative mt-1 flex items-baseline gap-1.5">
          <p className="text-[30px] font-bold text-white tracking-[-0.045em]">{formatBase(summary.totalBase, symbol)}</p>
        </div>
        <p className="relative text-white/72 mt-1 text-base">
          {formatBsAbsolute(summary.totalBs)} · {summary.ordersCount} pedido{summary.ordersCount === 1 ? '' : 's'} completado{summary.ordersCount === 1 ? '' : 's'}
        </p>

        {channels.length > 0 && (
          <div className="flex gap-1.5 mt-3.5">
            {channels.map(([channel, count]) => (
              <span
                key={channel}
                className="flex-1 text-center text-[9.5px] font-semibold px-1 py-1.5 rounded-full bg-white text-brand-500 whitespace-nowrap"
              >
                {CHANNEL_LABEL[channel] ?? channel} · {count}
              </span>
            ))}
          </div>
        )}

        <div className="relative grid grid-cols-3 gap-2 mt-5 pt-3.5 border-t border-white/25">
          <div>
            <p className="font-semibold text-white uppercase tracking-wide text-base">Flujo neto</p>
            <p className="font-semibold text-white mt-0.5 text-base">{formatBase(summary.balanceBase, symbol)}</p>
            <p className="font-medium text-white/70 text-base">{formatBsAbsolute(summary.balanceBs)}</p>
          </div>
          <div>
            <p className="font-semibold text-white uppercase tracking-wide text-base">Cobrado hoy</p>
            <p className="font-semibold text-emerald-300 mt-0.5 text-base">{formatBase(summary.ingresosBase, symbol)}</p>
            <p className="font-medium text-white/70 text-base">{formatBsAbsolute(summary.ingresosBs)}</p>
          </div>
          <div>
            <p className="font-semibold text-white uppercase tracking-wide text-base">Egresos</p>
            <p className="font-semibold text-amber-300 mt-0.5 text-base">{formatBase(summary.egresosBase, symbol)}</p>
            <p className="font-medium text-white/70 text-base">{formatBsAbsolute(summary.egresosBs)}</p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <p className="font-semibold text-brand-950/50 uppercase tracking-wide mb-2 text-xs">Últimos movimientos</p>
        {movements.length === 0 ? (
          <p className="text-brand-950/40 font-light text-base">Sin movimientos todavía.</p>
        ) : (
          <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm divide-y divide-brand-950/[0.06]">
            {movements.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMovement(m)}
                className="flex items-center justify-between gap-2 px-4 py-3 w-full text-left hover:bg-brand-950/[0.02] transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-brand-950 truncate text-base">{m.description}</p>
                  <p className="text-brand-950/40 font-light text-xs">
                    {new Date(m.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${m.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {m.type === 'INCOME' ? '+' : '−'}
                  {formatBase(m.amountBase, symbol)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showExpenseDialog && (
        <ExpenseFormDialog
          onClose={() => setShowExpenseDialog(false)}
          onCreated={() => {
            setShowExpenseDialog(false);
            load();
            loadMovements();
          }}
        />
      )}

      {showIncomeDialog && (
        <IncomeFormDialog
          onClose={() => setShowIncomeDialog(false)}
          onCreated={() => {
            setShowIncomeDialog(false);
            load();
            loadMovements();
          }}
        />
      )}

      {selectedMovement && (
        <MovementDetailDialog movement={selectedMovement} symbol={symbol} onClose={() => setSelectedMovement(null)} />
      )}
    </div>
  );
}

function MovementDetailDialog({ movement, symbol, onClose }: { movement: MovementRow; symbol: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{movement.type === 'INCOME' ? 'Ingreso' : 'Egreso'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-brand-950/50">Monto</span>
            <span className={`font-semibold ${movement.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
              {movement.type === 'INCOME' ? '+' : '−'}
              {formatBase(movement.amountBase, symbol)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-brand-950/50">Descripción</span>
            <span className="text-brand-950 text-right">{movement.description}</span>
          </div>
          {movement.category && (
            <div className="flex items-center justify-between">
              <span className="text-brand-950/50">Categoría</span>
              <span className="text-brand-950">{CATEGORY_LABELS[movement.category]}</span>
            </div>
          )}
          {movement.incomeCategory && (
            <div className="flex items-center justify-between">
              <span className="text-brand-950/50">Tipo de ingreso</span>
              <span className="text-brand-950">{INCOME_CATEGORY_LABELS[movement.incomeCategory]}</span>
            </div>
          )}
          {movement.paymentMethod && (
            <div className="flex items-center justify-between">
              <span className="text-brand-950/50">Método de pago</span>
              <span className="text-brand-950">{PAYMENT_LABELS[movement.paymentMethod]}</span>
            </div>
          )}
          {movement.supplier && (
            <div className="flex items-center justify-between">
              <span className="text-brand-950/50">Proveedor</span>
              <span className="text-brand-950">{movement.supplier.name}</span>
            </div>
          )}
          {movement.inventoryItem && (
            <div className="flex items-center justify-between">
              <span className="text-brand-950/50">Reabasteció</span>
              <span className="text-brand-950">
                {movement.inventoryItem.name} · {movement.inventoryQuantity}
              </span>
            </div>
          )}
          {movement.isCredit && (
            <div className="flex items-center justify-between">
              <span className="text-brand-950/50">Crédito</span>
              <span className={movement.creditPaidAt ? 'text-emerald-600' : 'text-amber-600'}>
                {movement.creditPaidAt ? `Pagado el ${new Date(movement.creditPaidAt).toLocaleDateString('es-VE')}` : 'Pendiente de pagar'}
              </span>
            </div>
          )}
          {movement.createdByName && (
            <div className="flex items-center justify-between">
              <span className="text-brand-950/50">Registrado por</span>
              <span className="text-brand-950">{movement.createdByName}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-brand-950/50">Fecha</span>
            <span className="text-brand-950">{new Date(movement.createdAt).toLocaleString('es-VE')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

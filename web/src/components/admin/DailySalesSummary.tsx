import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { TrendingUp, Plus } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExpenseFormDialog, CATEGORY_LABELS, type ExpenseCategory } from './ExpenseFormDialog';
import { IncomeFormDialog, INCOME_CATEGORY_LABELS, type IncomeCategory } from './IncomeFormDialog';
import { PAYMENT_LABELS } from './PaymentDialog';
import type { Currency, PaymentMethod } from '@/types';

interface TodaySummary {
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  currency: Currency;
  byChannel: { DINE_IN: number; DELIVERY: number; PICKUP: number; BAR: number };
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

const CHANNEL_LABEL: Record<string, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Retiro', BAR: 'Barra' };

/** Resumen de ventas del día (hora de Caracas) en el Dashboard del restaurante. En celular es
 * una tarjeta compacta de 3 columnas; en pantallas anchas se desglosa hacia abajo (Balance,
 * Ingresos, Egresos) y debajo se agregan "Añadir egreso" y los últimos movimientos — todo
 * dentro de la columna fija (estática) del Dashboard, mientras las comandas se desplazan aparte. */
export function DailySalesSummary() {
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

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('order:new', load);
    socket.on('order:updated', load);

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!summary) return null;

  const symbol = CURRENCY_SYMBOLS[summary.currency];
  const channels = Object.entries(summary.byChannel).filter(([, count]) => count > 0);

  return (
    <div className="w-full">
      {/* Celular: tarjeta "Ventas de hoy" — fondo azul de marca a pantalla completa, con
          el desglose Balance/Ingresos/Egresos abajo, todo dentro de la misma ventana. */}
      <div className="lg:hidden w-full mb-4 rounded-[20px] bg-brand-500 shadow-sm px-4 py-4 text-left">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-sm font-semibold text-white shrink-0">Ventas de hoy</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowExpenseDialog(true)}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-white/15 text-amber-300 hover:bg-white/25 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3 w-3" /> Egreso
            </button>
            <button
              type="button"
              onClick={() => setShowIncomeDialog(true)}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-white/15 text-emerald-300 hover:bg-white/25 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3 w-3" /> Ingreso
            </button>
          </div>
        </div>

        <div className="flex items-baseline gap-1.5">
          <p className="text-[26px] font-bold text-white tracking-tight">{formatBase(summary.ingresosBase, symbol)}</p>
          <span className="text-[13px] font-medium text-white/75">· {formatBsAbsolute(summary.ingresosBs)}</span>
        </div>
        <p className="text-[11.5px] text-white/80 mt-0.5">
          {summary.ordersCount} pedido{summary.ordersCount === 1 ? '' : 's'} completado{summary.ordersCount === 1 ? '' : 's'}
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

        <div className="grid grid-cols-3 gap-2 mt-4 pt-3.5 border-t border-white/25">
          <div>
            <p className="text-[9.5px] font-semibold text-white uppercase tracking-wide">Balance</p>
            <p className="text-[13.5px] font-semibold text-white mt-0.5">{formatBase(summary.balanceBase, symbol)}</p>
            <p className="text-[9.5px] font-medium text-white/70">{formatBsAbsolute(summary.balanceBs)}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-semibold text-white uppercase tracking-wide">Ingresos</p>
            <p className="text-[13.5px] font-semibold text-emerald-300 mt-0.5">{formatBase(summary.ingresosBase, symbol)}</p>
            <p className="text-[9.5px] font-medium text-white/70">{formatBsAbsolute(summary.ingresosBs)}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-semibold text-white uppercase tracking-wide">Egresos</p>
            <p className="text-[13.5px] font-semibold text-amber-300 mt-0.5">{formatBase(summary.egresosBase, symbol)}</p>
            <p className="text-[9.5px] font-medium text-white/70">{formatBsAbsolute(summary.egresosBs)}</p>
          </div>
        </div>
      </div>

      {/* Pantallas anchas: la ventana solo trae Balance/Ingresos/Egresos desglosados hacia
          abajo; "Añadir egreso" y los últimos movimientos quedan debajo, fuera de la ventana. */}
      <div className="hidden lg:block mb-4 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-4 text-left">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-brand-500" />
          <p className="text-sm font-semibold text-brand-950">Movimientos del día</p>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-brand-950/50 font-medium">Balance</p>
            <p className={`text-2xl font-semibold ${Number(summary.balanceBase) < 0 ? 'text-red-600' : 'text-brand-950'}`}>
              {formatBsAbsolute(summary.balanceBs)}
            </p>
            <p className="text-xs text-brand-950/40 font-light">{formatBase(summary.balanceBase, symbol)}</p>
          </div>
          <div className="pt-3 border-t border-brand-950/[0.06]">
            <p className="text-xs text-brand-950/50 font-medium">Ingresos</p>
            <p className="text-lg font-semibold text-emerald-600">{formatBsAbsolute(summary.ingresosBs)}</p>
            <p className="text-xs text-brand-950/40 font-light">{formatBase(summary.ingresosBase, symbol)}</p>
          </div>
          <div className="pt-3 border-t border-brand-950/[0.06]">
            <p className="text-xs text-brand-950/50 font-medium">Egresos</p>
            <p className="text-lg font-semibold text-red-600">{formatBsAbsolute(summary.egresosBs)}</p>
            <p className="text-xs text-brand-950/40 font-light">{formatBase(summary.egresosBase, symbol)}</p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="flex items-center gap-2 mb-4">
          <TextureButton
            variant="secondary"
            size="sm"
            className="!w-auto flex items-center gap-1.5 !text-amber-600"
            onClick={() => setShowExpenseDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Añadir egreso
          </TextureButton>
          <TextureButton
            variant="secondary"
            size="sm"
            className="!w-auto flex items-center gap-1.5 !text-emerald-600"
            onClick={() => setShowIncomeDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Añadir ingreso
          </TextureButton>
        </div>

        <p className="text-xs font-semibold text-brand-950/50 uppercase tracking-wide mb-2">Últimos movimientos</p>
        {movements.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light">Sin movimientos todavía.</p>
        ) : (
          <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm divide-y divide-brand-950/[0.06]">
            {movements.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMovement(m)}
                className="flex items-center justify-between gap-2 px-4 py-3 w-full text-left hover:bg-brand-950/[0.02] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-950 truncate">{m.description}</p>
                  <p className="text-xs text-brand-950/40 font-light">
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

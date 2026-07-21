import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { TrendingUp, Plus } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExpenseFormDialog, CATEGORY_LABELS, type ExpenseCategory } from './ExpenseFormDialog';
import type { Currency } from '@/types';

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
      {/* Celular: tarjeta compacta de 3 columnas, todo dentro de la misma ventana. */}
      <div className="lg:hidden max-w-md mb-8 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-5 py-4 text-left">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5 text-brand-500" />
          <p className="text-sm font-semibold text-brand-950">Movimientos del día</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-lg font-semibold text-emerald-600">{formatBsAbsolute(summary.ingresosBs)}</p>
            <p className="text-[11px] text-brand-950/40 font-light">{formatBase(summary.ingresosBase, symbol)}</p>
            <p className="text-[11px] text-brand-950/50 font-medium mt-0.5">Ingresos</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-red-600">{formatBsAbsolute(summary.egresosBs)}</p>
            <p className="text-[11px] text-brand-950/40 font-light">{formatBase(summary.egresosBase, symbol)}</p>
            <p className="text-[11px] text-brand-950/50 font-medium mt-0.5">Egresos</p>
          </div>
          <div>
            <p className={`text-lg font-semibold ${Number(summary.balanceBase) < 0 ? 'text-red-600' : 'text-brand-950'}`}>
              {formatBsAbsolute(summary.balanceBs)}
            </p>
            <p className="text-[11px] text-brand-950/40 font-light">{formatBase(summary.balanceBase, symbol)}</p>
            <p className="text-[11px] text-brand-950/50 font-medium mt-0.5">Balance</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs bg-brand-950/[0.06] text-brand-950/70 px-2.5 py-1 rounded-full font-medium">
            {summary.ordersCount} pedido{summary.ordersCount === 1 ? '' : 's'}
          </span>
          {channels.map(([channel, count]) => (
            <span key={channel} className="text-xs bg-brand-950/[0.06] text-brand-950/60 px-2.5 py-1 rounded-full">
              {CHANNEL_LABEL[channel] ?? channel}: {count}
            </span>
          ))}
        </div>

        <TextureButton
          variant="secondary"
          size="sm"
          className="!w-auto px-3 mt-3 flex items-center gap-1.5"
          onClick={() => setShowExpenseDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Añadir egreso
        </TextureButton>
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
        <TextureButton
          variant="secondary"
          size="sm"
          className="!w-auto px-3 mb-4 flex items-center gap-1.5"
          onClick={() => setShowExpenseDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Añadir egreso
        </TextureButton>

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

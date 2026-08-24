import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { shopApi, type RawConsumptionPlan } from './shopApi';
import { shopMoneyFormatters } from './shopFormat';

/**
 * Planes de consumo (Local Comercial): metros/kilos que un cliente compró por adelantado a
 * tarifa rebajada y va retirando con el tiempo — la inversa de Cuentas por Cobrar. Acá el saldo
 * está a favor del cliente, no del local.
 *
 * Solo lectura + cierre manual: la activación y el consumo pasan por el POS (ver ShopPosPage,
 * botón "Plan" en la tarjeta del producto y el aviso "cobrar con cargo al plan" en el carrito),
 * porque ahí es donde ya está resuelto el pago/stock — duplicar esa lógica acá invitaría a que
 * las dos formas de tocar un plan se desincronizaran.
 */
export default function ShopConsumptionPlansPage() {
  const { restaurant } = useAuth();
  const { money } = shopMoneyFormatters(restaurant!);
  const [plans, setPlans] = useState<RawConsumptionPlan[] | null>(null);
  const [tab, setTab] = useState<'activos' | 'cerrados'>('activos');

  function cargar() {
    shopApi.listPlans().then(setPlans);
  }
  useEffect(cargar, []);

  async function cerrar(id: string) {
    if (!window.confirm('¿Cerrar este plan? El saldo que le quede al cliente se pierde — no se puede deshacer.')) return;
    await shopApi.closePlan(id);
    cargar();
  }

  if (!plans) return <p className="text-sm font-light text-brand-950/50">Cargando…</p>;

  const activos = plans.filter((p) => !p.closedAt);
  const cerrados = plans.filter((p) => p.closedAt);
  const visibles = tab === 'activos' ? activos : cerrados;
  const saldoTotal = activos.reduce((a, p) => a + p.remainingUnits * p.ratePerUnit, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-brand-950">Planes de consumo</h1>
        <p className="mt-0.5 text-sm font-light text-brand-950/50">
          Metros comprados por adelantado, pendientes de retirar. Se venden y se consumen desde Venta.
        </p>
      </div>

      {activos.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.05] px-4 py-3">
          <Wallet className="h-5 w-5 shrink-0 text-brand-500" />
          <p className="text-sm text-brand-950/70">
            <span className="font-bold text-brand-950">{activos.length}</span> plan{activos.length === 1 ? '' : 'es'} activo
            {activos.length === 1 ? '' : 's'} · saldo pendiente por retirar valorizado en{' '}
            <span className="font-bold text-brand-950">{money(saldoTotal)}</span>
          </p>
        </div>
      )}

      <div className="inline-flex gap-1 rounded-full bg-brand-950/[0.05] p-1">
        {(['activos', 'cerrados'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
            }`}
          >
            {t === 'activos' ? `Activos (${activos.length})` : `Cerrados (${cerrados.length})`}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-950/15 py-10 text-center text-sm font-light text-brand-950/40">
          {tab === 'activos' ? 'Sin planes activos todavía.' : 'Ningún plan cerrado.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((p) => {
            const pct = Math.round((p.remainingUnits / p.totalUnits) * 100);
            return (
              <li key={p.id} className="rounded-2xl border border-brand-950/10 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-950">{p.customerName}</p>
                    <p className="text-xs text-brand-950/45">{p.customerPhone} · {p.product.name}</p>
                  </div>
                  <p className="text-right">
                    <span className="block font-bold text-brand-950">
                      {p.remainingUnits} de {p.totalUnits}
                    </span>
                    <span className="block text-xs text-brand-950/45">a {money(p.ratePerUnit)}/u · pagó {money(p.totalPaid)}</span>
                  </p>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-brand-950/[0.06]">
                  <div
                    className={`h-full rounded-full ${pct === 0 ? 'bg-brand-950/20' : 'bg-brand-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-brand-950/40">
                    Activado {new Date(p.createdAt).toLocaleDateString('es-VE')}
                    {p.closedAt && ` · Cerrado ${new Date(p.closedAt).toLocaleDateString('es-VE')}`}
                  </span>
                  {!p.closedAt && (
                    <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => cerrar(p.id)}>
                      Cerrar plan
                    </TextureButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

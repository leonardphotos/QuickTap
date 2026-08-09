import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, PackageX } from 'lucide-react';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import { EXPIRY_CLASS, expiryLabel, expiryStatus, formatExpiry } from '@/utils/expiry';

/** De dónde sale la fila: un insumo del inventario o un producto del menú. */
type AlertKind = 'INSUMO' | 'PRODUCTO';

interface ExpiringRow {
  kind: AlertKind;
  id: string;
  name: string;
  categoryName: string | null;
  photoUrl: string | null;
  expiryDate: string;
  daysLeft: number;
  quantity: string | null;
  unit: string;
}

interface LowStockRow {
  kind: AlertKind;
  id: string;
  name: string;
  categoryName: string | null;
  photoUrl: string | null;
  /** OUT = ya no queda nada; LOW = por debajo del mínimo configurado. */
  status: 'OUT' | 'LOW';
  quantity: string;
  minQuantity: string;
  unit: string;
}

interface AlertsResponse {
  today: string;
  days: number;
  expiring: ExpiringRow[];
  lowStock: LowStockRow[];
}

type Filter = 'vencer' | 'agotar';

const WINDOWS = [7, 15, 30, 60] as const;

const KIND_LABEL: Record<AlertKind, string> = { INSUMO: 'Insumo', PRODUCTO: 'Producto' };

/**
 * Inventario → Alertas. Los dos filtros que pidió el negocio, sobre insumos y
 * productos a la vez: qué se está por vencer y qué se está por acabar.
 *
 * El cálculo vive en el servidor (`GET /inventory/alerts`): la pestaña de
 * Insumos no tiene cargados los productos ni al revés, y comparar fechas contra
 * "hoy" en el navegador de un dispositivo con otro huso da resultados distintos
 * según quién mire.
 */
export function InventoryAlertsTab({ locationScope = 'LOCAL' }: { locationScope?: 'LOCAL' | 'CASA_MATRIZ' }) {
  const [filter, setFilter] = useState<Filter>('vencer');
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    api
      .get<{ data: AlertsResponse }>('/inventory/alerts', { params: { days, locationScope } })
      .then((res) => setData(res.data.data))
      .catch(() => setError('No se pudieron cargar las alertas.'));
  }, [days, locationScope]);

  useEffect(load, [load]);

  const expiring = data?.expiring ?? [];
  const lowStock = data?.lowStock ?? [];
  const out = lowStock.filter((r) => r.status === 'OUT').length;

  return (
    <div className="space-y-5">
      <p className="text-sm font-light text-brand-950/60">
        Lo que hay que atender antes de que sea un problema: insumos y productos juntos, sin tener que revisar cada
        pestaña por separado.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === 'vencer'}
          onClick={() => setFilter('vencer')}
          icon={<CalendarClock className="h-4 w-4" />}
          label="Por vencerse"
          count={expiring.length}
        />
        <FilterChip
          active={filter === 'agotar'}
          onClick={() => setFilter('agotar')}
          icon={<PackageX className="h-4 w-4" />}
          label="Agotados y por agotarse"
          count={lowStock.length}
        />
      </div>

      {filter === 'vencer' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-light text-brand-950/50">Ventana:</span>
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                days === w ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.05] text-brand-950/60 hover:bg-brand-950/[0.08]',
              )}
            >
              {w} días
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="font-light text-brand-950/40">Cargando…</p>}

      {data && filter === 'vencer' && (
        <Section
          empty={expiring.length === 0}
          emptyText={`Nada se vence en los próximos ${days} días.`}
        >
          {expiring.map((row) => {
            const status = expiryStatus(row.expiryDate, data.today);
            return (
              <Row key={`${row.kind}-${row.id}`} row={row}>
                <div className="shrink-0 text-right">
                  <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', EXPIRY_CLASS[status])}>
                    {expiryLabel(row.expiryDate, data.today)}
                  </span>
                  <p className="mt-1 text-[11px] font-light text-brand-950/40">{formatExpiry(row.expiryDate)}</p>
                </div>
              </Row>
            );
          })}
        </Section>
      )}

      {data && filter === 'agotar' && (
        <>
          {lowStock.length > 0 && (
            <p className="text-[13px] font-light text-brand-950/50">
              {out} sin existencias · {lowStock.length - out} por agotarse
            </p>
          )}
          <Section empty={lowStock.length === 0} emptyText="Todo tiene existencias por encima del mínimo.">
            {lowStock.map((row) => (
              <Row key={`${row.kind}-${row.id}`} row={row}>
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-bold',
                      row.status === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
                    )}
                  >
                    {row.status === 'OUT' ? 'Agotado' : 'Por agotarse'}
                  </span>
                  <p className="mt-1 text-[11px] font-light text-brand-950/45">
                    {row.quantity} {row.unit}
                    {Number(row.minQuantity) > 0 && ` · mín. ${row.minQuantity}`}
                  </p>
                </div>
              </Row>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors',
        active ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.05] text-brand-950/60 hover:bg-brand-950/[0.08]',
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[11px] font-bold',
          active ? 'bg-white/25' : 'bg-brand-950/[0.08] text-brand-950/60',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function Section({ empty, emptyText, children }: { empty: boolean; emptyText: string; children: React.ReactNode }) {
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-950/10 p-8 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-brand-950/20" />
        <p className="mt-2 text-[13px] font-light text-brand-950/45">{emptyText}</p>
      </div>
    );
  }
  return <ul className="divide-y divide-brand-950/10 rounded-2xl border border-brand-950/10 bg-white">{children}</ul>;
}

function Row({
  row,
  children,
}: {
  row: { kind: AlertKind; name: string; categoryName: string | null; photoUrl: string | null };
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {row.photoUrl ? (
        <img src={row.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-lg bg-brand-950/[0.06]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-brand-950">{row.name}</p>
        <p className="truncate text-xs font-light text-brand-950/45">
          {KIND_LABEL[row.kind]}
          {row.categoryName ? ` · ${row.categoryName}` : ''}
        </p>
      </div>
      {children}
    </li>
  );
}

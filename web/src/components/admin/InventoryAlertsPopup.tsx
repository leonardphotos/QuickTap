import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, PackageX } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { formatExpiry } from '@/utils/expiry';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

interface ExpiringRow {
  kind: 'INSUMO' | 'PRODUCTO';
  id: string;
  name: string;
  expiryDate: string;
  daysLeft: number;
  quantity: string | null;
  unit: string;
}

interface LowStockRow {
  kind: 'INSUMO' | 'PRODUCTO';
  id: string;
  name: string;
  status: 'OUT' | 'LOW';
  quantity: string;
  minQuantity: string;
  unit: string;
}

interface AlertsResponse {
  expiring: ExpiringRow[];
  lowStock: LowStockRow[];
}

const UNIT_LABEL: Record<string, string> = { kg: 'Kg', lt: 'Lt', ml: 'ml', unidad: 'Und' };
const qty = (v: string | null, unit: string) => (v == null ? '' : `${Number(v)} ${UNIT_LABEL[unit] ?? unit}`);

/**
 * Aviso emergente de inventario en el Dashboard: se abre solo al entrar mientras haya
 * insumos/productos agotados, por debajo del mínimo o por vencer (próximos 7 días). Se puede
 * cerrar para trabajar, pero NO se apaga: vuelve a salir en cada visita al Dashboard hasta que
 * el stock se reponga o la caducidad se actualice — es el recordatorio que no se olvida.
 */
export function InventoryAlertsPopup() {
  const { restaurant, user } = useAuth();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [open, setOpen] = useState(false);

  const canSee =
    restaurant?.businessType === 'RESTAURANT' &&
    (hasFeature(restaurant, 'inventoryBasic') || hasFeature(restaurant, 'inventoryRecipe')) &&
    (user?.role === 'OWNER' || user?.role === 'ADMIN' || (user?.role === 'CASHIER' && user.cashierFullAccess));

  useEffect(() => {
    if (!canSee) return;
    api
      .get('/inventory/alerts', { params: { days: 7 } })
      .then((res) => {
        const d = res.data.data as AlertsResponse;
        setData(d);
        if (d.expiring.length + d.lowStock.length > 0) setOpen(true);
      })
      .catch(() => setData(null));
  }, [canSee]);

  if (!canSee || !data || !open) return null;

  const out = data.lowStock.filter((r) => r.status === 'OUT');
  const low = data.lowStock.filter((r) => r.status === 'LOW');
  const total = data.expiring.length + data.lowStock.length;

  return (
    <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
            Inventario en alerta · {total}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[13px] font-light text-brand-950/55">
          Este aviso vuelve a aparecer cada vez que entres al Resumen hasta que repongas el stock o actualices la
          caducidad.
        </p>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {out.length > 0 && (
            <AlertGroup icon={PackageX} tone="red" title={`Agotados (${out.length})`}>
              {out.map((r) => (
                <Row key={r.id} name={r.name} kind={r.kind} detail={`mínimo ${qty(r.minQuantity, r.unit)}`} />
              ))}
            </AlertGroup>
          )}
          {low.length > 0 && (
            <AlertGroup icon={AlertTriangle} tone="amber" title={`Por agotarse (${low.length})`}>
              {low.map((r) => (
                <Row key={r.id} name={r.name} kind={r.kind} detail={`quedan ${qty(r.quantity, r.unit)} · mínimo ${qty(r.minQuantity, r.unit)}`} />
              ))}
            </AlertGroup>
          )}
          {data.expiring.length > 0 && (
            <AlertGroup icon={CalendarClock} tone="amber" title={`Por vencer (${data.expiring.length})`}>
              {data.expiring.map((r) => (
                <Row
                  key={r.id}
                  name={r.name}
                  kind={r.kind}
                  detail={
                    r.daysLeft < 0
                      ? `venció el ${formatExpiry(r.expiryDate)}`
                      : r.daysLeft === 0
                        ? 'vence hoy'
                        : `vence en ${r.daysLeft} día${r.daysLeft === 1 ? '' : 's'} (${formatExpiry(r.expiryDate)})`
                  }
                  danger={r.daysLeft <= 0}
                />
              ))}
            </AlertGroup>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setOpen(false)}>
            Seguir trabajando
          </TextureButton>
          <Link to="/admin/purchases">
            <TextureButton variant="secondary" size="sm" className="!w-auto">
              Registrar compra
            </TextureButton>
          </Link>
          <Link to="/admin/inventory">
            <TextureButton variant="brand" size="sm" className="!w-auto">
              Ir a Inventario
            </TextureButton>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AlertGroup({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof AlertTriangle;
  tone: 'red' | 'amber';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide ${tone === 'red' ? 'text-red-600' : 'text-amber-700'}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <div className="divide-y divide-brand-950/[0.06] rounded-xl border border-brand-950/10">{children}</div>
    </div>
  );
}

function Row({ name, kind, detail, danger }: { name: string; kind: 'INSUMO' | 'PRODUCTO'; detail: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium text-brand-950">{name}</span>
      <span className={`shrink-0 text-xs ${danger ? 'font-semibold text-red-600' : 'text-brand-950/50'}`}>{detail}</span>
      <span className="shrink-0 rounded-full bg-brand-950/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-brand-950/50">
        {kind === 'INSUMO' ? 'Insumo' : 'Producto'}
      </span>
    </div>
  );
}

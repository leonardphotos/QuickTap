import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatBs } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';

const SHOP_PLAN_PRICE_USD = 20;

const SHOP_PLAN_FEATURES = [
  'Punto Pago: sube tu QR de Pago Móvil una sola vez y cóbralo con el monto en Bs y la tasa del día en una sola pantalla',
  'Inventario con foto obligatoria, variantes de talla/color o stock básico',
  'Punto de venta con escaneo por cámara o lector, y carrito flotante con el total en $ y Bs',
  'Acepta Efectivo Bs/$, Pago Móvil, Zelle, Binance y ventas fiadas (completas o con abono)',
  'Caja: apertura, cierre y arqueo con historial de informes',
  'Ingresos por método de pago, margen de utilidad y productos más vendidos',
  'Alertas de stock bajo y productos próximos a vencer',
  'Directorio de clientes y roles de equipo (Dueño, Administrador, Cajero)',
];

/** Único plan de QuickTap Shop por ahora — a diferencia de PlanCards (Restaurantes), no hay
 * todavía varios niveles ni contenido editable desde el master; precio y beneficios son fijos. */
export function ShopPlanCard({ rateBs }: { rateBs: string | null }) {
  const navigate = useNavigate();

  return (
    <div className="max-w-md mx-auto">
      <div className="h-full flex flex-col rounded-2xl border border-brand-400/40 bg-white p-6 shadow-[0_16px_40px_-20px_rgba(5,108,242,0.45)]">
        <p className="font-semibold text-brand-950">QuickTap Shop</p>
        <p className="text-xs text-brand-950/50 font-light mt-0.5">
          Todos los beneficios de QuickTap para tiendas, ropa, calzado, ferreterías, farmacias y más
        </p>

        <div className="mt-4">
          <span className="text-3xl font-semibold text-brand-950">${SHOP_PLAN_PRICE_USD.toFixed(2)}</span>
          <span className="text-brand-950/60">/mes</span>
          {rateBs && <p className="text-xs text-brand-950/50 mt-0.5">{formatBs(SHOP_PLAN_PRICE_USD, rateBs)}/mes · a tasa BCV</p>}
        </div>

        <ul className="mt-4 space-y-2 text-sm text-brand-950/70 flex-1 font-light">
          {SHOP_PLAN_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" /> {f}
            </li>
          ))}
        </ul>

        <TextureButton variant="brand" size="default" className="mt-6" onClick={() => navigate('/admin/register/rubro')}>
          Elegir plan
        </TextureButton>
      </div>
    </div>
  );
}

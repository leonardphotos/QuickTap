import type { AuthRestaurant } from '@/context/AuthContext';
import { VerticalBillingPage } from '@/components/admin/VerticalBillingPage';

// Espejo de DEFAULT_PLAN_CONTENT (platform-settings.service.ts): son solo los valores por
// defecto mientras carga /public/plans — lo editable desde el Dashboard maestro manda.
const SHOP_DEFAULT_FEATURES = [
  'Punto Pago: sube tu QR de Pago Móvil una sola vez y cóbralo con el monto en Bs y la tasa del día en una sola pantalla',
  'Inventario con foto obligatoria, variantes de talla/color o stock básico',
  'Punto de venta con escaneo por cámara o lector, y carrito flotante con el total en $ y Bs',
  'Acepta Efectivo Bs/$, Pago Móvil, Zelle, Binance y ventas fiadas (completas o con abono)',
  'Caja: apertura, cierre y arqueo con historial de informes',
  'Cuentas por cobrar de ventas fiadas',
  'CRM: clientes por segmento y promociones con código canjeable',
  'Ingresos por método de pago, gastos y productos más vendidos',
  'Alertas de stock bajo y productos próximos a vencer',
  'Roles de equipo (Dueño, Administrador, Cajero)',
];

const ELITE_SHOP_DEFAULT_FEATURES = [
  'Todo QuickTap Shop en cada sucursal',
  'Contabilidad completa: libro de ingresos y egresos con exportación e importación en Excel',
  'Cuentas bancarias por método de pago con saldo automático y transferencias',
  'Proveedores con relación de cuenta y órdenes de pago con retenciones',
  'Libros de compras y ventas',
  'Margen de utilidad y punto de equilibrio',
  'Sucursales: catálogo copiado, inventario y caja por sede, y ventas consolidadas',
  'Soporte prioritario por WhatsApp',
];

/** Facturación de Locales Comerciales (pestaña dentro de ShopLayout): Shop y Elite Shop lado a lado. */
export default function ShopBillingPage({ restaurant, onDone }: { restaurant: AuthRestaurant; onDone: () => void }) {
  return (
    <VerticalBillingPage
      plan="SHOP"
      defaultName="QuickTap Shop"
      defaultSubtitle="La operación diaria de tu local: tiendas, ropa, calzado, ferreterías, farmacias y más"
      defaultFeatures={SHOP_DEFAULT_FEATURES}
      extraPlans={[
        {
          plan: 'ELITE_SHOP',
          defaultName: 'Elite Shop',
          defaultSubtitle: 'Todo lo de QuickTap Shop + administración completa y sucursales',
          defaultFeatures: ELITE_SHOP_DEFAULT_FEATURES,
        },
      ]}
      trialingMessage="Elige el plan con el que quieres seguir cuando termine la prueba."
      restaurant={restaurant}
      onDone={onDone}
    />
  );
}

import type { AuthRestaurant } from '@/context/AuthContext';
import { VerticalBillingPage } from '@/components/admin/VerticalBillingPage';

const SHOP_DEFAULT_FEATURES = [
  'Punto Pago: sube tu QR de Pago Móvil una sola vez y cóbralo con el monto en Bs y la tasa del día en una sola pantalla',
  'Inventario con foto obligatoria, variantes de talla/color o stock básico',
  'Punto de venta con escaneo por cámara o lector, y carrito flotante con el total en $ y Bs',
  'Acepta Efectivo Bs/$, Pago Móvil, Zelle, Binance y ventas fiadas (completas o con abono)',
  'Caja: apertura, cierre y arqueo con historial de informes',
  'Ingresos por método de pago, margen de utilidad y productos más vendidos',
  'Alertas de stock bajo y productos próximos a vencer',
  'Directorio de clientes y roles de equipo (Dueño, Administrador, Cajero)',
];

/** Facturación de Locales Comerciales (pestaña dentro de ShopLayout) — ver VerticalBillingPage. */
export default function ShopBillingPage({ restaurant, onDone }: { restaurant: AuthRestaurant; onDone: () => void }) {
  return (
    <VerticalBillingPage
      plan="SHOP"
      defaultName="QuickTap Shop"
      defaultSubtitle="Todos los beneficios de QuickTap para tiendas, ropa, calzado, ferreterías, farmacias y más"
      defaultFeatures={SHOP_DEFAULT_FEATURES}
      trialingMessage="Activa QuickTap Shop para seguir usándolo cuando termine la prueba."
      restaurant={restaurant}
      onDone={onDone}
    />
  );
}

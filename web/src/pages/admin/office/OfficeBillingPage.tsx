import type { AuthRestaurant } from '@/context/AuthContext';
import { VerticalBillingPage } from '@/components/admin/VerticalBillingPage';

/** Espejo de los `features` del plan OFFICE en el backend (platform-settings.service.ts).
 *  Son el respaldo si /public/plans no responde: el cliente ve el plan igual. */
const OFFICE_DEFAULT_FEATURES = [
  'Varias empresas en la misma cuenta, con su propia moneda y ejercicio fiscal',
  'Plan de cuentas jerárquico, listo para usar desde el primer día',
  'Libro diario con partida doble: el asiento no se guarda si no cuadra',
  'Anulación con contra-asiento: nada se borra, todo queda trazable',
  'Balance de comprobación, estado de resultados y balance general',
  'Clientes, proveedores y empleados por empresa',
  'Soporte por WhatsApp',
];

/** Facturación de Administración (pantalla dentro de OfficeLayout) — ver VerticalBillingPage. */
export default function OfficeBillingPage({ restaurant, onDone }: { restaurant: AuthRestaurant; onDone: () => void }) {
  return (
    <VerticalBillingPage
      plan="OFFICE"
      defaultName="QuickTap Administración"
      defaultSubtitle="Contabilidad y administración de una o varias empresas, desde una sola cuenta"
      defaultFeatures={OFFICE_DEFAULT_FEATURES}
      trialingMessage="Activa QuickTap Administración para seguir usándolo cuando termine la prueba."
      restaurant={restaurant}
      onDone={onDone}
    />
  );
}

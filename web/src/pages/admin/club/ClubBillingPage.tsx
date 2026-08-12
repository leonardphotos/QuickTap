import type { AuthRestaurant } from '@/context/AuthContext';
import { VerticalBillingPage } from '@/components/admin/VerticalBillingPage';

const CLUB_DEFAULT_FEATURES = [
  'Calendario de canchas en vivo, con reservas y bloqueos por mantenimiento/clases/torneos',
  'Acceso por QR/código: el jugador entra a su reserva sin pasar por recepción',
  'Tablet de cancha: pedidos a la tienda del club y cobro con el monto en Bs y la tasa del día',
  'Hasta 4 tiendas vinculadas, cada una cobrando lo suyo con su propio método de pago',
  'Academia: programas, horarios y lista de espera',
  'Caja: apertura, cierre y arqueo con historial de informes',
  'Directorio de jugadores y roles de equipo (Dueño, Administrador, Cajero, Cancha)',
];

/** Facturación de Canchas (pestaña dentro de ClubLayout) — ver VerticalBillingPage. */
export default function ClubBillingPage({ restaurant, onDone }: { restaurant: AuthRestaurant; onDone: () => void }) {
  return (
    <VerticalBillingPage
      plan="CLUB"
      defaultName="QuickTap Club"
      defaultSubtitle="Todos los beneficios de QuickTap para canchas y clubes deportivos"
      defaultFeatures={CLUB_DEFAULT_FEATURES}
      trialingMessage="Activa QuickTap Club para seguir usándolo cuando termine la prueba."
      restaurant={restaurant}
      onDone={onDone}
    />
  );
}

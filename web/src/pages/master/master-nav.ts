import { Activity, BarChart3, DollarSign, FileText, Nfc, Receipt, Store, Tag, Users, Wallet } from 'lucide-react';

export interface MasterNavLink {
  to: string;
  label: string;
  icon: typeof Store;
  /** Texto corto para el tile de "Accesos rápidos" del Resumen (la barra usa `label`). */
  hint: string;
}

/**
 * Destinos del Dashboard maestro, separados en dos grupos por frecuencia de uso — no por tema.
 *
 * OPERATION es lo que el equipo abre todos los días (revisar pagos, entrar a un local); CONFIG es
 * lo que se toca de vez en cuando (tarifas, plantillas, credenciales). Meter los 9 en una sola
 * barra hacía que las pastillas se comprimieran y partieran el texto en 2-3 líneas, con alturas
 * desparejas; con esta división la barra muestra solo los 4 de uso diario y el resto vive en un
 * desplegable "Configuración".
 *
 * Fuente única: la barra (MasterLayout) y los accesos rápidos (MasterSummaryPage) leen de acá.
 */
export const MASTER_OPERATION_LINKS: MasterNavLink[] = [
  { to: '/master/summary', label: 'Resumen', icon: BarChart3, hint: 'Ingresos y pendientes' },
  { to: '/master/live', label: 'En vivo', icon: Activity, hint: 'Lo que se genera ahora mismo' },
  { to: '/master/restaurants', label: 'Locales', icon: Store, hint: 'Restaurantes y tiendas' },
  { to: '/master/proofs', label: 'Comprobantes', icon: Receipt, hint: 'Pagos por aprobar' },
  { to: '/master/qrnfc-requests', label: 'Solicitud QRNFC', icon: Nfc, hint: 'Pedidos de QR y NFC' },
  { to: '/master/quotes', label: 'Cotizaciones', icon: FileText, hint: 'Presupuestos a futuros clientes' },
];

export const MASTER_CONFIG_LINKS: MasterNavLink[] = [
  { to: '/master/plans', label: 'Planes', icon: DollarSign, hint: 'Precios y contenido' },
  { to: '/master/promo-codes', label: 'Códigos promo', icon: Tag, hint: 'Descuentos vigentes' },
  { to: '/master/payment-methods', label: 'Datos de pago', icon: Wallet, hint: 'Pago Móvil de QuickTap' },
  { to: '/master/admins', label: 'Usuarios', icon: Users, hint: 'Equipo QuickTap' },
];

export const MASTER_NAV_LINKS: MasterNavLink[] = [...MASTER_OPERATION_LINKS, ...MASTER_CONFIG_LINKS];

import { Activity, BarChart3, Cpu, DollarSign, FileText, MessageCircle, Nfc, Receipt, Sparkles, Star, Store, Tag, TrendingDown, Users, Wallet } from 'lucide-react';

export interface MasterNavLink {
  to: string;
  label: string;
  icon: typeof Store;
  /** Texto corto para el tile de "Accesos rápidos" del Resumen (la barra usa `label`). */
  hint: string;
  roles: MasterRole[];
}

export type MasterRole = 'ADMIN' | 'MANAGER' | 'SUPPORT' | 'FINANCE' | 'AUDITOR';
const ALL_ROLES: MasterRole[] = ['ADMIN', 'MANAGER', 'SUPPORT', 'FINANCE', 'AUDITOR'];

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
  { to: '/master/summary', label: 'Resumen', icon: BarChart3, hint: 'Ingresos y pendientes', roles: ALL_ROLES },
  { to: '/master/administration', label: 'Administración', icon: Wallet, hint: 'Ingresos, gastos y nómina', roles: ['ADMIN', 'MANAGER', 'FINANCE', 'AUDITOR'] },
  { to: '/master/printing', label: 'Impresiones', icon: Receipt, hint: 'Comandas por impresora', roles: ALL_ROLES },
  { to: '/master/live', label: 'En vivo', icon: Activity, hint: 'Lo que se genera ahora mismo', roles: ALL_ROLES },
  { to: '/master/restaurants', label: 'Locales', icon: Store, hint: 'Restaurantes y tiendas', roles: ALL_ROLES },
  { to: '/master/proofs', label: 'Pagos por verificar', icon: Receipt, hint: 'Pagos por aprobar', roles: ['ADMIN', 'MANAGER', 'FINANCE'] },
  { to: '/master/qrnfc-requests', label: 'Solicitud QRNFC', icon: Nfc, hint: 'Pedidos de QR y NFC', roles: ['ADMIN', 'MANAGER', 'SUPPORT'] },
  { to: '/master/quotes', label: 'Cotizaciones', icon: FileText, hint: 'Presupuestos a futuros clientes', roles: ['ADMIN', 'MANAGER'] },
  { to: '/master/advisor-leads', label: 'Asesorías', icon: Star, hint: 'Prospectos del Plan Elite por llamar', roles: ['ADMIN', 'MANAGER', 'SUPPORT'] },
  { to: '/master/funnel', label: 'Abandonos', icon: TrendingDown, hint: 'Quién no terminó de registrarse', roles: ['ADMIN', 'MANAGER', 'SUPPORT'] },
  { to: '/master/catalog-ai', label: 'Cargar catálogo', icon: Sparkles, hint: 'Montar la carta de un cliente con IA', roles: ['ADMIN', 'MANAGER', 'SUPPORT'] },
];

export const MASTER_CONFIG_LINKS: MasterNavLink[] = [
  { to: '/master/billing-notices', label: 'Avisos de cobro', icon: MessageCircle, hint: 'Recordatorios por SMS', roles: ['ADMIN', 'MANAGER', 'FINANCE'] },
  { to: '/master/whatsapp', label: 'WhatsApp', icon: MessageCircle, hint: 'Vincular y mensajes del chatbot', roles: ['ADMIN'] },
  { to: '/master/plans', label: 'Planes', icon: DollarSign, hint: 'Precios y contenido', roles: ['ADMIN'] },
  { to: '/master/promo-codes', label: 'Códigos promo', icon: Tag, hint: 'Descuentos vigentes', roles: ['ADMIN'] },
  { to: '/master/payment-methods', label: 'Datos de pago', icon: Wallet, hint: 'Pago Móvil de QuickTap', roles: ['ADMIN'] },
  { to: '/master/ai-usage', label: 'Uso y costos de IA', icon: Cpu, hint: 'Cuánto gasta QuickTap en Gemini', roles: ['ADMIN', 'AUDITOR'] },
  { to: '/master/assistant', label: 'Control del Asistente', icon: Cpu, hint: 'Créditos, recargas y presupuesto Gemini', roles: ['ADMIN', 'MANAGER', 'FINANCE'] },
  { to: '/master/admins', label: 'Usuarios', icon: Users, hint: 'Equipo QuickTap', roles: ['ADMIN'] },
];

export const MASTER_NAV_LINKS: MasterNavLink[] = [...MASTER_OPERATION_LINKS, ...MASTER_CONFIG_LINKS];

export function canAccessMasterLink(role: MasterRole, link: MasterNavLink) {
  return link.roles.includes(role);
}

export function canAccessMasterPath(role: MasterRole, pathname: string) {
  if (pathname.endsWith('/olaclick-import')) return ['ADMIN', 'MANAGER', 'SUPPORT'].includes(role);
  const link = MASTER_NAV_LINKS.find(
    (item) => pathname === item.to || (item.to === '/master/restaurants' && pathname.startsWith('/master/restaurants/')),
  );
  return !link || canAccessMasterLink(role, link);
}

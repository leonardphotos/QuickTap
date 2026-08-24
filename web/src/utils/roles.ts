import type { UserRole } from '../types';

/**
 * Espejo manual de la matriz de permisos del backend (src/utils/roles.ts).
 * Debe mantenerse sincronizado con esa fuente de verdad.
 */
// CASHIER YA NO está acá: por defecto tiene el mismo acceso que Mesero, más abrir/cerrar caja
// y ver movimientos del día por método de pago. Un dueño/admin le puede devolver el acceso
// completo de antes activando `cashierFullAccess` desde Ajustes → Equipo — ver el segundo
// parámetro de `hasFullAccess`/`isAdminCashier` debajo, mismo patrón que `canAccessInventory`.
export const FULL_ACCESS_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'STAFF'];
// Administración, Gastos, Productos, Mesas/QR y "Movimientos del día": solo dueño/admin (ver nota arriba).
export const ADMIN_CASHIER_ROLES: UserRole[] = ['OWNER', 'ADMIN'];
export const RESTRICTED_ROLES: UserRole[] = ['WAITER', 'KITCHEN'];
// Pantalla: un único monitor/TV con Mesas + Cocina en formato horizontal.
export const SCREEN_ROLES: UserRole[] = ['SCREEN'];
// Comanda: tablet en modo kiosco de autoservicio, el propio cliente hace su pedido.
export const KIOSK_ROLES: UserRole[] = ['COMANDA'];
// Numero: pantalla de solo lectura junto al mostrador, solo avisos de "listo"
// de Autoservicio (Comanda) y Pickup.
export const NUMERO_ROLES: UserRole[] = ['NUMERO'];
// Cancha: tablet fija en una cancha de un club. El jugador escanea el QR de su
// reserva y pide desde ahí; lo consumido se cobra en la Caja del club.
export const CANCHA_ROLES: UserRole[] = ['CANCHA'];
// Profesor de la academia. No se recicla WAITER: ese arrastra Cocina y Órdenes de
// Mesa, que en un club no significan nada. Solo ve su agenda, pasa lista y consulta
// sus honorarios.
export const COACH_ROLES: UserRole[] = ['COACH'];

// Puerta de un evento (Local Comercial): escanea entradas y puede vender en el sitio.
// Espejo manual de src/utils/roles.ts — cambiar los dos juntos.
export const VERIFICADOR_ROLES: UserRole[] = ['VERIFICADOR'];
export const TEAM_MANAGER_ROLES: UserRole[] = ['OWNER', 'ADMIN'];
// Quién puede condonar/descontar saldo al cobrar (campo "Descuento %" en Pagar/Pago fraccionado).
export const DISCOUNT_ROLES: UserRole[] = ['OWNER', 'ADMIN'];
export const ASSIGNABLE_TEAM_ROLES: UserRole[] = [
  'ADMIN',
  'CASHIER',
  'WAITER',
  'KITCHEN',
  'SCREEN',
  'COMANDA',
  'NUMERO',
  'CANCHA',
  'COACH',
];
// Roles a los que aplica la Pantalla de bloqueo — se excluyen SCREEN/COMANDA/NUMERO/CANCHA
// (dispositivos compartidos: TV de cocina, kiosco de autoservicio, ticker de "listo",
// tablet de la cancha). COACH sí entra: es la sesión personal de una persona.
export const LOCK_SCREEN_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'CASHIER', 'STAFF', 'WAITER', 'KITCHEN', 'COACH'];
export const DEFAULT_LOCK_SCREEN_MINUTES = 5;

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Dueño',
  STAFF: 'Personal',
  ADMIN: 'Administrador',
  CASHIER: 'Cajero',
  WAITER: 'Mesero',
  KITCHEN: 'Cocina',
  SCREEN: 'Pantalla',
  COMANDA: 'Comanda',
  NUMERO: 'Numero',
  CANCHA: 'Cancha',
  COACH: 'Profesor',
  VERIFICADOR: 'Verificador',
};

// Rutas visibles según el rol. "*" habilita todas las rutas del admin.
const RESTRICTED_PATHS = ['/admin/kitchen', '/admin/table-orders'];
const SCREEN_PATH = '/admin/screen';
// Dentro de FULL_ACCESS_ROLES, STAFF (Personal) no puede entrar a estas rutas
// aunque tenga "acceso total" al resto del panel (toma de pedidos, cocina, etc).
const ADMIN_CASHIER_ONLY_PATHS = [
  '/admin/products',
  '/admin/tables',
  '/admin/administration',
  '/admin/expenses',
  '/admin/sucursales',
  '/admin/reservations',
  '/admin/quotes',
];

/** `cashierFullAccess`: solo importa para rol CASHIER (ver User.cashierFullAccess) — un Cajero
 * con este flag activo se comporta como si tuviera acceso total/admin-cajero, igual que antes. */
export function hasFullAccess(role?: UserRole | null, cashierFullAccess?: boolean): boolean {
  if (!role) return false;
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  return role === 'CASHIER' && !!cashierFullAccess;
}

export function isAdminCashier(role?: UserRole | null, cashierFullAccess?: boolean): boolean {
  if (!role) return false;
  if (ADMIN_CASHIER_ROLES.includes(role)) return true;
  return role === 'CASHIER' && !!cashierFullAccess;
}

export function isScreenRole(role?: UserRole | null): boolean {
  if (!role) return false;
  return SCREEN_ROLES.includes(role);
}

export function isKioskRole(role?: UserRole | null): boolean {
  if (!role) return false;
  return KIOSK_ROLES.includes(role);
}

export function isNumeroRole(role?: UserRole | null): boolean {
  if (!role) return false;
  return NUMERO_ROLES.includes(role);
}

export function isCanchaRole(role?: UserRole | null): boolean {
  if (!role) return false;
  return CANCHA_ROLES.includes(role);
}

export function canManageTeam(role?: UserRole | null): boolean {
  if (!role) return false;
  return TEAM_MANAGER_ROLES.includes(role);
}

export function canApplyDiscount(role?: UserRole | null): boolean {
  if (!role) return false;
  return DISCOUNT_ROLES.includes(role);
}

export function needsLockScreen(role?: UserRole | null): boolean {
  if (!role) return false;
  return LOCK_SCREEN_ROLES.includes(role);
}

const KIOSK_PATH = '/admin/comanda';
const NUMERO_PATH = '/admin/numero';

export function canAccessPath(
  role: UserRole | null | undefined,
  pathname: string,
  canAccessInventory?: boolean,
  cashierFullAccess?: boolean,
): boolean {
  if (!isAdminCashier(role, cashierFullAccess) && ADMIN_CASHIER_ONLY_PATHS.some((p) => pathname.startsWith(p))) return false;
  if (hasFullAccess(role, cashierFullAccess)) return true;
  if (isScreenRole(role)) return pathname.startsWith(SCREEN_PATH);
  if (isKioskRole(role)) return pathname.startsWith(KIOSK_PATH);
  if (isNumeroRole(role)) return pathname.startsWith(NUMERO_PATH);
  if (canAccessInventory && pathname.startsWith('/admin/inventory')) return true;
  // Comandas también es visible para Mesero/Cocina/Cajero (sin acceso completo): ahí ven sus
  // propios pedidos (Mesero/Cajero) o todos (Cocina) — Resumen ("/admin" exacto) queda vedado
  // porque trae montos de venta y datos financieros, no confundir con "/admin/*" en general,
  // que sigue vedado para estos roles salvo lo listado abajo.
  if (pathname === '/admin/comandas') return true;
  return RESTRICTED_PATHS.some((p) => pathname.startsWith(p));
}

/** Ruta de aterrizaje por defecto según el rol (a dónde redirigir tras login). */
export function defaultPathFor(role?: UserRole | null): string {
  if (isScreenRole(role)) return SCREEN_PATH;
  if (isKioskRole(role)) return KIOSK_PATH;
  if (isNumeroRole(role)) return NUMERO_PATH;
  return '/admin/kitchen';
}

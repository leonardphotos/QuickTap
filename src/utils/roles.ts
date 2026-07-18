/**
 * Matriz de permisos por rol. Única fuente de verdad en el backend —
 * el frontend mantiene un espejo manual en web/src/utils/roles.ts.
 */

// Roles con acceso total al panel (todas las pestañas y todas las mutaciones).
export const FULL_ACCESS_ROLES = ['OWNER', 'ADMIN', 'CASHIER', 'STAFF'] as const;

// Administración, Gastos, Productos, Mesas/QR y "Movimientos del día": solo dueño/admin/cajero.
// STAFF (Personal) conserva Cocina/Órdenes de Mesa/Delivery/Ajustes, pero no estas secciones.
export const ADMIN_CASHIER_ROLES = ['OWNER', 'ADMIN', 'CASHIER'] as const;

// Roles restringidos: solo Cocina + Órdenes de Mesa (sin mutaciones de catálogo/config).
export const RESTRICTED_ROLES = ['WAITER', 'KITCHEN'] as const;

// Pantalla: un único monitor/TV con Mesas + Cocina en formato horizontal.
export const SCREEN_ROLES = ['SCREEN'] as const;

// Roles que pueden administrar la sección "Equipo" (crear/editar/eliminar personal).
export const TEAM_MANAGER_ROLES = ['OWNER', 'ADMIN'] as const;

// Roles asignables desde la UI de Equipo (OWNER/STAFF no se asignan ahí).
export const ASSIGNABLE_TEAM_ROLES = ['ADMIN', 'CASHIER', 'WAITER', 'KITCHEN', 'SCREEN'] as const;

/**
 * Matriz de permisos por rol. Única fuente de verdad en el backend —
 * el frontend mantiene un espejo manual en web/src/utils/roles.ts.
 */

// Roles con acceso total al panel (todas las pestañas y todas las mutaciones).
// CASHIER YA NO está acá: por defecto tiene el mismo acceso que Mesero (ver RESTRICTED_ROLES
// más abajo), más abrir/cerrar caja y ver movimientos del día por método de pago (rutas que se
// gatean explícitamente con el rol, no con este grupo). Un dueño/admin puede devolverle el
// acceso completo de antes activando `User.cashierFullAccess` desde Ajustes → Equipo — ver
// `requireRoleOrCashierFullAccess` en auth.middleware.ts, el mismo patrón que
// `canAccessInventory` usa para Mesero/Cocina.
export const FULL_ACCESS_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;

// Administración, Gastos, Productos, Mesas/QR y "Movimientos del día": solo dueño/admin (ver
// nota de CASHIER arriba). STAFF (Personal) conserva Cocina/Órdenes de Mesa/Delivery/Ajustes,
// pero no estas secciones.
export const ADMIN_CASHIER_ROLES = ['OWNER', 'ADMIN'] as const;

// Roles restringidos: solo Cocina + Órdenes de Mesa (sin mutaciones de catálogo/config).
export const RESTRICTED_ROLES = ['WAITER', 'KITCHEN'] as const;

// Pantalla: un único monitor/TV con Mesas + Cocina en formato horizontal.
export const SCREEN_ROLES = ['SCREEN'] as const;

// Comanda: tablet en modo kiosco de autoservicio, el propio cliente hace su pedido.
export const KIOSK_ROLES = ['COMANDA'] as const;

// Numero: pantalla de solo lectura junto al mostrador, solo avisos de "listo"
// de Autoservicio (Comanda) y Pickup — para llamar al cliente por su número.
export const NUMERO_ROLES = ['NUMERO'] as const;

// Roles que pueden administrar la sección "Equipo" (crear/editar/eliminar personal).
export const TEAM_MANAGER_ROLES = ['OWNER', 'ADMIN'] as const;

// Roles que pueden marcar a un cliente como SOCIO. Es aparte de TEAM_MANAGER_ROLES a
// propósito: un socio consume sin que eso sea una venta, así que darle esa marca a alguien
// equivale a autorizarle consumo gratis y no puede quedar al alcance de quien toma pedidos.
export const PARTNER_MANAGER_ROLES = ['OWNER', 'ADMIN'] as const;

// Roles que pueden condonar/descontar parte del saldo de un pedido al cobrar
// (campo "Descuento %" en Pagar/Pago fraccionado). Cajero/Mesero no pueden.
export const DISCOUNT_ROLES = ['OWNER', 'ADMIN'] as const;

// Cancha: tablet fija en una cancha de un club deportivo. El jugador escanea el
// QR de su reserva y pide desde ahí; lo consumido se suma a su cuenta y se cobra
// en la Caja del club. Solo existe en tenants SPORTS_CLUB.
export const CANCHA_ROLES = ['CANCHA'] as const;

// Profesor de la academia (club deportivo). NO se recicla WAITER: ese rol arrastra
// acceso a Cocina y Órdenes de Mesa (RESTRICTED_ROLES), que en un club no significan
// nada. Alcance: su propia agenda, pasar lista y consultar sus honorarios — siempre
// filtrado por el coachId que sale de su userId en el token, nunca de un parámetro.
export const COACH_ROLES = ['COACH'] as const;

// Puerta de un evento (Local Comercial): escanea las entradas para marcar quién ya entró y
// detectar duplicadas. También puede vender en el sitio, porque mucha entrada se vende en la
// misma puerta. No ve inventario, caja ni reportes.
export const VERIFICADOR_ROLES = ['VERIFICADOR'] as const;

// Tablet compartida de meseros: mismo patrón que SCREEN/COMANDA/NUMERO (una cuenta de
// dispositivo, con su correo/clave real para el login normal), pero su única pantalla es un
// teclado de 4 dígitos — la clave sola identifica a cuál mesero pertenece, sin elegir nombre.
export const WAITER_TABLET_ROLES = ['WAITER_TABLET'] as const;

// Roles asignables desde la UI de Equipo (OWNER/STAFF no se asignan ahí).
export const ASSIGNABLE_TEAM_ROLES = [
  'ADMIN',
  'CASHIER',
  'WAITER',
  'WAITER_TABLET',
  'KITCHEN',
  'SCREEN',
  'COMANDA',
  'NUMERO',
  'CANCHA',
  'COACH',
  'VERIFICADOR',
] as const;

// Roles a los que aplica la Pantalla de bloqueo (PIN de 4 dígitos). Se excluyen
// SCREEN/COMANDA/NUMERO/CANCHA/WAITER_TABLET porque son dispositivos compartidos de un solo uso
// (TV de cocina, kiosco de autoservicio, ticker de "listo", tablet de la cancha, tablet de
// meseros) — bloquearlos periódicamente interrumpiría a clientes/pantallas públicas en vez de
// proteger la sesión de un miembro del equipo.
export const LOCK_SCREEN_ROLES = ['OWNER', 'ADMIN', 'CASHIER', 'STAFF', 'WAITER', 'KITCHEN', 'COACH'] as const;

// Minutos de inactividad por defecto cuando el rol no tiene un valor propio en
// Restaurant.lockScreenIntervals.
export const DEFAULT_LOCK_SCREEN_MINUTES = 5;

import type { PurchasablePlan } from '@/utils/plans';
export interface PlanContent { id: PurchasablePlan; name: string; subtitle: string; capacity: string; features: string[]; tier?: 'popular' | 'premium'; }
export const CHATBOT_FEATURES: string[] = [];
// Cada plan muestra su lista completa; compartir datos no oculta beneficios al cliente.
const CORE_BENEFITS = [
 'Menú digital con QR para que tus clientes consulten productos y precios',
 'Catálogo con categorías, variantes, extras y modificadores',
 'Pedidos de mesa, barra, express y para retirar en un mismo sistema',
 'Cuentas por mesa para organizar el consumo de cada cliente',
 'Pantalla de cocina para seguir la preparación de los pedidos',
 'Impresión de comandas con equipos compatibles',
 'Registro de cobros con distintos métodos de pago',
 'Pagos parciales y seguimiento de saldos pendientes',
 'Apertura y cierre de caja para controlar cada jornada',
 'Accesos por usuario y rol para organizar las tareas del equipo',
 'QuickStar para guiar la configuración inicial del restaurante',
];
const OPERATIONS_BENEFITS = [
 ...CORE_BENEFITS,
 'Gestión de pedidos a domicilio desde el panel',
 'Asignación y seguimiento de entregas por motorizado',
 'Zonas de delivery con tarifas de envío configurables',
 'Reservas para organizar la atención del local',
 'Panel administrativo para consultar el desempeño del negocio',
 'Registro de ingresos y gastos para seguir el movimiento del dinero',
 'Reportes de ventas y cobros para revisar los resultados',
 'Inventario básico con existencias y avisos de stock mínimo',
 'Cuentas por cobrar para dar seguimiento a las deudas de clientes',
];
export const PLAN_CONTENT: PlanContent[] = [
 { id:'ESSENTIAL', name:'Esencial', subtitle:'Recibe y organiza tus pedidos.', capacity:'3 usuarios · 15 mesas · 100 productos · 1 cocina/impresión · 1 sede', features:[...CORE_BENEFITS] },
 { id:'OPERATIONS', name:'Operación', subtitle:'Maneja el local completo.', capacity:'8 usuarios · 40 mesas · 300 productos · 1 sede', tier:'popular', features:[...OPERATIONS_BENEFITS] },
 { id:'CONTROL', name:'Control', subtitle:'Conoce y controla toda tu operación.', capacity:'15 usuarios entre sus sedes · hasta 2 sedes · mesas y productos ilimitados', tier:'premium', features:[
 ...OPERATIONS_BENEFITS,
 'Recetas por producto con ingredientes y cantidades definidos',
 'Preparaciones para organizar la producción de tu cocina',
 'Cálculo del costo de recetas a partir de sus ingredientes',
 'Análisis de márgenes y estructura de costos por producto',
 'Punto de equilibrio para conocer cuánto necesitas vender',
 'Registro de mermas y desperdicios para controlar las pérdidas',
 'Gestión de compras y proveedores',
 'Control de cuentas bancarias y movimientos financieros',
 'Administración de casa matriz y sucursales dentro del límite del plan',
 'Transferencias de inventario entre sedes',
 'Estadísticas avanzadas para analizar la operación',
 ] },
];

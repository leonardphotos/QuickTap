/**
 * Plan de cuentas inicial que se crea con cada empresa.
 *
 * No pretende ser el plan definitivo de nadie: es el mínimo con el que se puede empezar a
 * registrar el mismo día —caja, banco, clientes, proveedores, ventas, compras, sueldos— y sobre
 * el que después se agregan las cuentas propias del negocio. Una empresa que arranca con el plan
 * vacío no puede cargar ni un asiento, y esa es la razón por la que estos sistemas se abandonan
 * en la primera sesión.
 *
 * Los códigos siguen el esquema clásico: 1 activo, 2 pasivo, 3 patrimonio, 4 ingresos, 5 gastos.
 */
export interface CuentaBase {
  code: string;
  name: string;
  kind: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  /** Las cuentas de agrupación no reciben asientos: totalizan a sus hijas. */
  postable?: boolean;
  /** Código del padre, para armar el árbol. */
  parent?: string;
}

export const PLAN_BASE: CuentaBase[] = [
  { code: '1', name: 'Activo', kind: 'ASSET', postable: false },
  { code: '1.1', name: 'Activo corriente', kind: 'ASSET', postable: false, parent: '1' },
  { code: '1.1.01', name: 'Caja', kind: 'ASSET', parent: '1.1' },
  { code: '1.1.02', name: 'Bancos', kind: 'ASSET', parent: '1.1' },
  { code: '1.1.03', name: 'Cuentas por cobrar', kind: 'ASSET', parent: '1.1' },
  { code: '1.1.04', name: 'Inventario', kind: 'ASSET', parent: '1.1' },
  { code: '1.1.05', name: 'Anticipos a proveedores', kind: 'ASSET', parent: '1.1' },
  { code: '1.2', name: 'Activo no corriente', kind: 'ASSET', postable: false, parent: '1' },
  { code: '1.2.01', name: 'Mobiliario y equipos', kind: 'ASSET', parent: '1.2' },
  { code: '1.2.02', name: 'Depreciación acumulada', kind: 'ASSET', parent: '1.2' },

  { code: '2', name: 'Pasivo', kind: 'LIABILITY', postable: false },
  { code: '2.1', name: 'Pasivo corriente', kind: 'LIABILITY', postable: false, parent: '2' },
  { code: '2.1.01', name: 'Cuentas por pagar', kind: 'LIABILITY', parent: '2.1' },
  { code: '2.1.02', name: 'Impuestos por pagar', kind: 'LIABILITY', parent: '2.1' },
  { code: '2.1.03', name: 'Sueldos por pagar', kind: 'LIABILITY', parent: '2.1' },
  { code: '2.1.04', name: 'Anticipos de clientes', kind: 'LIABILITY', parent: '2.1' },
  { code: '2.2', name: 'Pasivo no corriente', kind: 'LIABILITY', postable: false, parent: '2' },
  { code: '2.2.01', name: 'Préstamos bancarios', kind: 'LIABILITY', parent: '2.2' },

  { code: '3', name: 'Patrimonio', kind: 'EQUITY', postable: false },
  { code: '3.1.01', name: 'Capital', kind: 'EQUITY', parent: '3' },
  { code: '3.1.02', name: 'Resultados acumulados', kind: 'EQUITY', parent: '3' },

  { code: '4', name: 'Ingresos', kind: 'INCOME', postable: false },
  { code: '4.1.01', name: 'Ventas', kind: 'INCOME', parent: '4' },
  { code: '4.1.02', name: 'Servicios', kind: 'INCOME', parent: '4' },
  { code: '4.1.03', name: 'Otros ingresos', kind: 'INCOME', parent: '4' },

  { code: '5', name: 'Gastos', kind: 'EXPENSE', postable: false },
  { code: '5.1', name: 'Costo de ventas', kind: 'EXPENSE', postable: false, parent: '5' },
  { code: '5.1.01', name: 'Compras de mercancía', kind: 'EXPENSE', parent: '5.1' },
  { code: '5.2', name: 'Gastos operativos', kind: 'EXPENSE', postable: false, parent: '5' },
  { code: '5.2.01', name: 'Sueldos y salarios', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.2.02', name: 'Alquiler', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.2.03', name: 'Servicios públicos', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.2.04', name: 'Transporte y fletes', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.2.05', name: 'Mantenimiento', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.2.06', name: 'Publicidad', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.2.07', name: 'Honorarios profesionales', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.2.08', name: 'Gastos administrativos', kind: 'EXPENSE', parent: '5.2' },
  { code: '5.3', name: 'Gastos financieros', kind: 'EXPENSE', postable: false, parent: '5' },
  { code: '5.3.01', name: 'Comisiones bancarias', kind: 'EXPENSE', parent: '5.3' },
  { code: '5.3.02', name: 'Intereses', kind: 'EXPENSE', parent: '5.3' },
];

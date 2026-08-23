import { api } from '@/api/client';

export interface Empresa {
  id: string;
  nombre: string;
  rif: string | null;
  moneda: 'USD' | 'EUR';
  activa: boolean;
  asientos: number;
  contactos: number;
}

export interface Cuenta {
  id: string;
  code: string;
  name: string;
  kind: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  parentId: string | null;
  postable: boolean;
  active: boolean;
  debe: string;
  haber: string;
  saldo: string;
}

export interface Asiento {
  id: string;
  numero: number;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  anulado: boolean;
  total: string;
  lineas: { cuenta: string; debe: string; haber: string; detalle: string | null; contacto: string | null }[];
}

export interface Contacto {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isEmployee: boolean;
  active: boolean;
}

export interface Panel {
  mes: { ingresos: string; gastos: string; resultado: string };
  asientos: number;
  contactos: number;
  serie: { mes: string; ingresos: number; gastos: number }[];
}

export interface Reportes {
  balanceComprobacion: { code: string; name: string; kind: Cuenta['kind']; debe: string; haber: string; saldo: string }[];
  totales: { debe: string; haber: string };
  estadoResultados: { ingresos: string; gastos: string; resultado: string; margen: string };
  balanceGeneral: { activo: string; pasivo: string; patrimonio: string; resultadoDelPeriodo: string; descuadre: string };
}

const base = '/office';

export const officeApi = {
  empresas: () => api.get<{ data: Empresa[] }>(`${base}/companies`).then((r) => r.data.data),
  crearEmpresa: (body: Record<string, unknown>) => api.post(`${base}/companies`, body).then((r) => r.data.data),
  panel: (companyId: string) => api.get<{ data: Panel }>(`${base}/companies/${companyId}/dashboard`).then((r) => r.data.data),
  cuentas: (companyId: string) => api.get<{ data: Cuenta[] }>(`${base}/companies/${companyId}/accounts`).then((r) => r.data.data),
  crearCuenta: (companyId: string, body: Record<string, unknown>) =>
    api.post(`${base}/companies/${companyId}/accounts`, body).then((r) => r.data.data),
  asientos: (companyId: string, params?: Record<string, string>) =>
    api.get<{ data: Asiento[] }>(`${base}/companies/${companyId}/entries`, { params }).then((r) => r.data.data),
  crearAsiento: (companyId: string, body: Record<string, unknown>) =>
    api.post(`${base}/companies/${companyId}/entries`, body).then((r) => r.data.data),
  anularAsiento: (companyId: string, entryId: string, reason: string) =>
    api.post(`${base}/companies/${companyId}/entries/${entryId}/void`, { reason }).then((r) => r.data.data),
  contactos: (companyId: string) => api.get<{ data: Contacto[] }>(`${base}/companies/${companyId}/contacts`).then((r) => r.data.data),
  crearContacto: (companyId: string, body: Record<string, unknown>) =>
    api.post(`${base}/companies/${companyId}/contacts`, body).then((r) => r.data.data),
  reportes: (companyId: string, params?: Record<string, string>) =>
    api.get<{ data: Reportes }>(`${base}/companies/${companyId}/reports`, { params }).then((r) => r.data.data),
};

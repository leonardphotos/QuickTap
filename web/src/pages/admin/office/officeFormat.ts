import type { Empresa } from './officeApi';

/** Formatea en la moneda de la empresa: dos del mismo administrador pueden llevarse distinto. */
export function money(empresa: Empresa, valor: string | number): string {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  const simbolo = empresa.moneda === 'EUR' ? '€' : '$';
  const signo = n < 0 ? '-' : '';
  return `${signo}${simbolo}${Math.abs(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** "2026-08" -> "Ago" */
export function mesCorto(clave: string): string {
  const m = Number(clave.split('-')[1]);
  return MESES[m - 1] ?? clave;
}

export const NOMBRE_TIPO: Record<string, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

/** Color por naturaleza de cuenta. Es semántico, no decorativo: separa de un vistazo lo que
 *  entra de lo que sale en un balance de cuarenta filas. */
export const COLOR_TIPO: Record<string, string> = {
  ASSET: 'bg-sky-50 text-sky-700',
  LIABILITY: 'bg-amber-50 text-amber-700',
  EQUITY: 'bg-violet-50 text-violet-700',
  INCOME: 'bg-emerald-50 text-emerald-700',
  EXPENSE: 'bg-rose-50 text-rose-700',
};

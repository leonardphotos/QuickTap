export function formatUsd(value: string | number): string {
  return `$${Number(value).toFixed(2)}`;
}

export function formatBs(value: string | number, rate: string | number): string {
  const bs = Number(value) * Number(rate);
  return `Bs ${bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

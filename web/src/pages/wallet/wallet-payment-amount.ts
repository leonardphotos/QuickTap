/** Importes en centavos: evita que el adelanto o su vista previa acumulen errores decimales. */
export function parseWalletAmount(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

export function previewWalletAdvance<T extends { id: string; number: number; saldo: number }>(cuotas: T[], amount: number) {
  let remaining = Math.max(0, Math.round(amount * 100));
  return [...cuotas].sort((a, b) => a.number - b.number).flatMap(c => {
    const balance = Math.max(0, Math.round(c.saldo * 100));
    const applied = Math.min(remaining, balance);
    remaining -= applied;
    return applied > 0 ? [{ id: c.id, number: c.number, applied: applied / 100, remaining: (balance - applied) / 100 }] : [];
  });
}

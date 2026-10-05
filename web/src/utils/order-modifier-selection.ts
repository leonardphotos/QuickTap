/** Recupera cada opción una sola vez; nunca selecciona un extra por coincidir en nombre. */
export function restoreModifierSelection(saved: { modifierId?: string | null; name: string; priceBase: string; quantity: number }[], catalog: { id: string; name: string; priceBase: string }[]) {
  const ids: string[] = [];
  for (const option of saved) {
    const matches = option.modifierId
      ? catalog.filter(m => m.id === option.modifierId)
      : catalog.filter(m => m.name === option.name && Number(m.priceBase) === Number(option.priceBase));
    if (matches.length !== 1) throw new Error(`No se puede identificar con certeza “${option.name}”. Revisa las opciones del producto antes de editarlo.`);
    ids.push(...Array(option.quantity).fill(matches[0].id));
  }
  return ids;
}

/** Precio acordado para esta venta; admite coma decimal sin aceptar valores inválidos. */
export function parseCustomService(nameInput: string, priceInput: string, costInput: string) {
  const name = nameInput.trim();
  const price = Number(priceInput.trim().replace(',', '.'));
  const cost = costInput.trim() ? Number(costInput.trim().replace(',', '.')) : 0;
  if (!name || name.length > 120 || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0) return null;
  const roundedPrice = Math.round((price + Number.EPSILON) * 100) / 100;
  if (roundedPrice <= 0) return null;
  return { name, price: roundedPrice, cost: Math.round((cost + Number.EPSILON) * 100) / 100 };
}

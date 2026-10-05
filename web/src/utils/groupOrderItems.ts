import type { LiveOrderItem } from '@/components/admin/LiveOrdersPanel.shared';

/** Agrupación exclusivamente visual: cada línea conserva su identidad y su tanda. */
export function groupOrderItems(items: LiveOrderItem[]) {
  const groups = new Map<string, { key: string; items: LiveOrderItem[]; quantity: number }>();
  for (const item of items) {
    const modifiers = item.modifiers.map(m => [m.name, m.priceBase, m.quantity]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const key = JSON.stringify([
      item.productId ?? item.id, item.productName, item.variantName ?? null,
      item.unitPrice, item.note ?? '', modifiers, !!item.deliveredAt,
      item.kitchenName ?? null, !!item.kitchenStartedAt, !!item.kitchenReadyAt,
      // Las líneas cobradas total o parcialmente se mantienen independientes.
      item.paidQuantity > 0 ? item.id : null,
    ]);
    const group = groups.get(key);
    if (group) { group.items.push(item); group.quantity += item.quantity; }
    else groups.set(key, { key, items: [item], quantity: item.quantity });
  }
  return [...groups.values()];
}

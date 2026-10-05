/** Mantiene el requisito de cliente del pedido manual; Express no lo necesita. */
export function manualOrderNeedsCustomer(channel: string) {
  return channel === 'DELIVERY' || channel === 'PICKUP' || channel === 'BAR';
}

export function manualOrderError(data: unknown): string {
  const response = data as { error?: string; details?: { fieldErrors?: Record<string, unknown>; formErrors?: unknown[] } } | undefined;
  const messages = [...Object.values(response?.details?.fieldErrors ?? {}).flat(), ...(response?.details?.formErrors ?? [])]
    .filter((message): message is string => typeof message === 'string');
  return [...new Set(messages)].join(' ') || response?.error || 'No se pudo crear el pedido.';
}

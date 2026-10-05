

export const WASTE_REASON_LABELS: Record<string, string> = {
  EXPIRED: 'Vencido',
  DAMAGED: 'Dañado',
  PREPARATION: 'Error de preparación',
  CUSTOMER_RETURN: 'Devolución del cliente',
  SPILLAGE: 'Derrame',
  THEFT: 'Faltante / robo',
  // Se genera sola al reabastecer un insumo con "Rendimiento %" < 100 (Inventario → Insumos);
  // se deja fuera del selector del formulario manual para no duplicarla a mano.
  YIELD_LOSS: 'Rendimiento (automático)',
  OTHER: 'Otro',
};

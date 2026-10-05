import { useRef, useState } from 'react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

/** El pedido ya existe: reintentar el envío nunca vuelve a crear la venta. */
export function SendOrderToKitchenDialog({ order, onDone }: {
  order: { id: string; orderNumber: number };
  onDone: (sent: boolean) => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  async function send() {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError('');
    try {
      await api.post(`/orders/${order.id}/accept`);
      onDone(true);
    } catch (e: any) {
      // Si la respuesta se perdió después de aceptar, consultar antes de ofrecer otro envío.
      const current = await api.get('/orders/live', { params: { paginated: '1', orderId: order.id } }).catch(() => null);
      const data = current?.data?.data;
      const fresh = data?.requestedOrder ?? data?.orders?.find((row: { id: string }) => row.id === order.id);
      if (fresh && ['KITCHEN', 'SERVED'].includes(fresh.status)) onDone(true);
      else setError(e.response?.data?.error ?? 'El pedido está guardado. No se pudo confirmar el envío; puedes reintentarlo.');
    } finally {
      busy.current = false;
      setSending(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy.current) onDone(false); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Pedido #{order.orderNumber} creado</DialogTitle></DialogHeader>
      <p className="text-brand-950/70 text-base">¿Deseas enviarlo a cocina?</p>
      <p className="text-brand-950/60 text-xs">Si eliges «Ahora no», quedará guardado en Pedidos, pendiente de enviar.</p>
      {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextureButton variant="brand" disabled={sending} onClick={send}>{sending ? 'Enviando…' : 'Sí, enviar a cocina'}</TextureButton>
        <TextureButton variant="secondary" disabled={sending} onClick={() => onDone(false)}>Ahora no</TextureButton>
      </div>
    </DialogContent>
  </Dialog>;
}

import { OrderDeliveryNoteButton } from './OrderDeliveryNoteButton';
import { useState } from 'react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { OrderCorrectionPanel } from './OrderCorrectionPanel';

/** También permite recuperar pedidos de cajas cerradas o anulados con devolución pendiente. */
export function FindOrderCorrectionDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const normalizedNumber = number.trim().replace(/^#\s*/, '');
  const validNumber = /^\d+$/.test(normalizedNumber) && Number.isSafeInteger(Number(normalizedNumber)) && Number(normalizedNumber) > 0;
  async function find() {
    if (loading || !validNumber) return;
    setLoading(true); setError(''); setOrderId(null);
    try {
      const response = await api.get('/orders/refunds/lookup', { params: { orderNumber: Number(normalizedNumber) } });
      setOrderId(response.data.data.id);
    } catch (e: any) { setError(e.response?.data?.error ?? 'No se pudo consultar el pedido.'); }
    finally { setLoading(false); }
  }
  return <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Corregir o anular pedido</DialogTitle></DialogHeader>
      <p className="text-brand-950/60 text-base">Busca por el número del pedido, por ejemplo #123. También puedes consultar pedidos de cajas cerradas.</p>
      <form className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2" onSubmit={event => { event.preventDefault(); void find(); }}>
        <label className="min-w-0 text-brand-950 text-sm font-medium">Número de pedido<input aria-label="Número de pedido" inputMode="numeric" placeholder="Ej. #123" disabled={loading} value={number} onChange={event => { setNumber(event.target.value); setError(''); setOrderId(null); }} className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-brand-950/15 bg-white px-3 font-normal focus:outline-2 focus:outline-brand-500 text-base" /></label>
        <TextureButton type="submit" variant="brand" className="!w-auto min-h-11 shrink-0" disabled={loading || !validNumber}>{loading ? 'Buscando…' : 'Buscar'}</TextureButton>
      </form>
      {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
      {orderId && <OrderDeliveryNoteButton key={orderId + '-note'} orderId={orderId} />}
      {orderId && <OrderCorrectionPanel key={orderId} orderId={orderId} onSaved={onSaved} />}
    </DialogContent>
  </Dialog>;
}

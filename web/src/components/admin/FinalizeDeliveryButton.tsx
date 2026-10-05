import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { LiveOrder } from './LiveOrdersPanel.shared';
import { getPaymentStatus } from './LiveOrdersPanel.shared';

export function FinalizeDeliveryButton({ order, disabled = false, onFinalized }: { order: LiveOrder; disabled?: boolean; onFinalized: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!['DELIVERY', 'PICKUP'].includes(order.channel) || order.deliveryFinalizedAt || order.adminCorrectedAt || order.status === 'CANCELLED') return null;
  const accepted = ['KITCHEN', 'SERVED'].includes(order.status);
  const paid = Math.round(getPaymentStatus(order).balanceBase * 100) <= 0;
  const reason = !accepted ? 'Acepta el pedido antes de finalizar.' : !paid ? 'Cobra el saldo pendiente antes de finalizar.' : null;
  async function finalize() {
    setBusy(true); setError(null);
    try {
      await api.post(`/orders/${order.id}/finalize-delivery`);
      setOpen(false); onFinalized();
    } catch (e: any) { setError(e.response?.data?.error ?? 'No se pudo finalizar. Actualiza el pedido e intenta de nuevo.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-1.5" onClick={event => event.stopPropagation()}>
    <button type="button" disabled={disabled || busy || !!reason} onClick={() => { setError(null); setOpen(true); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Finalizar pedido</button>
    {reason && <p className="text-brand-950/55 text-xs">{reason}</p>}
    <Dialog open={open} onOpenChange={value => !busy && setOpen(value)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>¿Finalizar pedido #{order.orderNumber}?</DialogTitle><DialogDescription>El pedido saldrá de la lista de pedidos activos y quedará cerrado para edición normal. Sus pagos se conservan. {order.channel === 'DELIVERY' ? 'La preparación y la entrega del motorizado mantienen su seguimiento independiente.' : 'La preparación y el retiro mantienen su seguimiento independiente.'}</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
        <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-brand-950/15 text-sm">Seguir editando</button><button type="button" disabled={busy} onClick={finalize} className="min-h-11 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Finalizando…' : 'Sí, finalizar'}</button></div>
      </DialogContent>
    </Dialog>
  </div>;
}

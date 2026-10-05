import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { api } from '@/api/client';

/** Reimprime el documento histórico; no acepta, cobra ni modifica el pedido. */
export function OrderDeliveryNoteButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function print() {
    if (busy) return;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      await api.post(`/orders/${orderId}/print-receipt`);
      setMessage('Nota enviada a la estación de impresión. Verifica que esté conectada.');
    } catch (e: any) {
      setFailed(true);
      setMessage(e.response?.data?.error ?? 'No se pudo enviar la nota de entrega. Intenta de nuevo.');
    } finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <button type="button" disabled={busy} onClick={print} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-600 disabled:opacity-50">
      <Receipt className="h-4 w-4" />{busy ? 'Enviando…' : 'Imprimir nota de entrega'}
    </button>
    {message && <p role={failed ? 'alert' : 'status'} className={`text-xs ${failed ? 'text-red-600' : 'text-brand-950/60'}`}>{message}</p>}
  </div>;
}

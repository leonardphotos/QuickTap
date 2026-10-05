import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext.shared';
import { listOrderDrafts, removeOrderDraft } from '@/utils/order-draft';

export type SavedOrderDraft = ReturnType<typeof listOrderDrafts>[number];
const channels = { DINE_IN: 'Mesa', EXPRESS: 'Express', BAR: 'Barra', DELIVERY: 'Delivery', PICKUP: 'Pick-up' };
export function useOrderDrafts() {
  const { restaurant, user } = useAuth();
  const restaurantId = restaurant?.id;
  const userId = user?.id;
  const [drafts, setDrafts] = useState<SavedOrderDraft[]>([]);
  useEffect(() => {
    const refresh = () => setDrafts(restaurantId && userId ? listOrderDrafts(restaurantId, userId) : []);
    refresh();
    window.addEventListener('quicktap:drafts-changed', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('quicktap:drafts-changed', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [restaurantId, userId]);
  return drafts;
}
export function OrderDraftsPanel({ drafts, onResume, onNew }: { drafts: SavedOrderDraft[]; onResume: (draft: SavedOrderDraft) => void; onNew: () => void }) {
  const [error, setError] = useState('');
  return <section aria-label="Pedidos en borrador" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-brand-950/60 text-base">Pedidos sin enviar a cocina. Se guardan en este navegador y solo son visibles para tu usuario; no se sincronizan con otros dispositivos.</p>
      <button onClick={onNew} className="min-h-[44px] rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">Crear otro pedido</button>
    </div>
    {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
    {!drafts.length && <p className="rounded-2xl border border-brand-950/10 bg-white p-8 text-center text-brand-950/50 text-base">No tienes pedidos sin finalizar en este dispositivo.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{drafts.map(draft => <article key={draft.key} className="flex flex-col gap-3 rounded-2xl border border-brand-950/10 bg-white p-4">
      <div className="flex items-center justify-between gap-2"><span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-brand-500">{channels[draft.data.channel]}</span><span className="text-xs text-brand-950/45">Sin finalizar</span></div>
      <h3 className="font-semibold text-brand-950">{draft.data.selectedCustomer?.name || 'Sin cliente asignado'}</h3>
      <p className="text-brand-950/60 text-base">{draft.data.lines.reduce((n, line) => n + line.quantity, 0)} productos · {draft.data.lines.slice(0, 3).map(line => line.product.name).join(', ') || 'Datos del pedido guardados'}{draft.data.lines.length > 3 ? '…' : ''}</p>
      <p className="text-brand-950/45 text-xs">{draft.savedAt && Number.isFinite(Date.parse(draft.savedAt)) ? `Guardado: ${new Date(draft.savedAt).toLocaleString('es-VE')}` : 'Borrador recuperado'}</p>
      <div className="mt-auto flex gap-2">
        <button onClick={() => onResume(draft)} className="min-h-[44px] flex-1 rounded-xl bg-brand-500 px-3 text-sm font-semibold text-white">Continuar pedido</button>
        <button onClick={() => { if (window.confirm('¿Descartar este borrador? No se puede deshacer.')) { if (!removeOrderDraft(draft.key)) setError('No se pudo eliminar el borrador. Revisa el almacenamiento del navegador.'); } }} className="min-h-[44px] rounded-xl border border-red-100 px-3 text-sm text-red-600">Descartar</button>
      </div>
    </article>)}</div>
  </section>;
}

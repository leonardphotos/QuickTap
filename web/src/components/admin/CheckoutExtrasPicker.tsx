import { useEffect, useState } from 'react';
import { PackagePlus, Plus } from 'lucide-react';
import { api } from '@/api/client';
import { formatBase } from '@/utils/format';
import type { CheckoutExtra } from './CheckoutExtrasSection';

export function CheckoutExtrasPicker({ symbol, disabled, onAdd }: { symbol: string; disabled: boolean; onAdd: (extra: CheckoutExtra) => void }) {
  const [extras, setExtras] = useState<CheckoutExtra[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get('/products/checkout-extras').then(r => setExtras(r.data.data.filter((e: CheckoutExtra) => e.isAvailable))).catch(() => setFailed(true)); }, []);
  if (failed) return <p className="text-red-600 text-xs">No se pudieron cargar los extras al cobrar. Vuelve a abrir el pago para intentarlo.</p>;
  if (!extras.length) return null;
  return <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3 space-y-2"><div className="flex items-center gap-2 text-sm font-medium text-brand-950"><PackagePlus size={17} className="text-brand-500"/>¿Necesita algo para llevar?</div><p className="text-brand-950/50 text-xs">Añade solo lo que se va a entregar.</p><div className="flex flex-wrap gap-2">{extras.map(extra => <button key={extra.id} type="button" disabled={disabled} onClick={() => onAdd(extra)} className="flex items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-3 text-sm text-brand-950 transition-colors hover:bg-sky-100 disabled:opacity-50"><Plus size={16} className="text-brand-500"/><span>{extra.name}</span><span className="font-semibold text-brand-500">{formatBase(extra.price, symbol)}</span></button>)}</div></section>;
}

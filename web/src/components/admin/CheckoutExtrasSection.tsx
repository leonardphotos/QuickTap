import { useEffect, useState } from 'react';
import { PackagePlus, Plus, Pencil, Check } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext.shared';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';

export interface CheckoutExtra { id: string; name: string; price: string | number; isAvailable: boolean }
export function CheckoutExtrasSection() {
  const { restaurant } = useAuth();
  const symbol = CURRENCY_SYMBOLS[restaurant?.baseCurrency ?? 'USD'];
  const [rows, setRows] = useState<CheckoutExtra[]>([]);
  const [editing, setEditing] = useState<CheckoutExtra | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { api.get('/products/checkout-extras').then(r => setRows(r.data.data)).catch(() => setError('No se pudieron cargar los extras.')); }, []);
  function edit(row: CheckoutExtra) { setEditing(row); setName(row.name); setPrice(String(row.price)); setEnabled(row.isAvailable); setMessage(''); }
  async function save() {
    if (!name.trim() || !price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) { setError('Escribe el nombre y un precio válido.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const body = { name: name.trim(), price: Number(price), isAvailable: enabled };
      const response = editing ? await api.patch(`/products/checkout-extras/${editing.id}`, body) : await api.post('/products/checkout-extras', body);
      setRows(previous => editing ? previous.map(r => r.id === editing.id ? response.data.data : r) : [...previous, response.data.data]);
      setEditing(null); setName(''); setPrice(''); setEnabled(true); setMessage('Extra guardado. Ya está disponible al cobrar.');
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-brand-950/10 bg-white p-5 sm:p-6 space-y-5">
    <div className="flex items-center gap-3"><span className="rounded-2xl bg-sky-50 p-3 text-brand-500"><PackagePlus size={22}/></span><div><h3 className="text-base font-semibold text-brand-950">Extras al cobrar</h3><p className="text-brand-950/50 mt-1 text-xs">Cajas, bolsas y otros artículos opcionales.</p></div></div>
    <p className="text-brand-950/60 text-base">Disponibles en la ventana de pago. No aparecen en el menú público y solo se cobran cuando los añades al pedido.</p>
    <div className="divide-y divide-brand-950/5">{rows.map(row => <div key={row.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium text-base">{row.name}</p><p className="text-brand-950/50 mt-1 text-xs">{formatBase(row.price, symbol)} por unidad · {row.isAvailable ? 'Activo' : 'Desactivado'}</p></div><button disabled={busy} type="button" onClick={() => edit(row)} className="shrink-0 rounded-xl p-3 text-brand-500 hover:bg-sky-50" aria-label={`Editar ${row.name}`}><Pencil size={18}/></button></div>)}</div>
    <div className="rounded-2xl bg-slate-50 p-4 space-y-4"><h4 className="text-sm font-medium">{editing ? 'Editar extra' : 'Añadir un extra'}</h4>
      <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3"><label className="text-brand-950/60 text-sm font-medium">Nombre<input value={name} maxLength={120} onChange={e=>setName(e.target.value)} placeholder="Ej. Caja para llevar" className="mt-2 w-full rounded-xl border border-brand-950/10 bg-white px-3 py-3 text-brand-950 text-base"/></label><label className="text-brand-950/60 text-sm font-medium">Precio ({symbol})<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="1.00" className="mt-2 w-full rounded-xl border border-brand-950/10 bg-white px-3 py-3 text-brand-950 text-base"/></label></div>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} className="accent-brand-500 h-4 w-4"/>Mostrar al pagar</label>
      <div className="flex items-center gap-3"><button type="button" disabled={busy} onClick={save} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{editing ? <Check size={16}/> : <Plus size={16}/>} {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Añadir extra'}</button>{editing && <button type="button" disabled={busy} onClick={()=>{setEditing(null);setName('');setPrice('');setEnabled(true);}} className="text-sm text-brand-950/60">Cancelar</button>}</div>
    </div>
    {error && <p role="alert" className="text-red-600 text-base">{error}</p>}{message && <p role="status" className="text-emerald-600 text-base">{message}</p>}
  </section>;
}

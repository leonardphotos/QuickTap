import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface History {
  total: number; filtered: number; visits: number;
  entries: { id: string; openedAt: string; guestCount: number }[];
  openSessions: { id: string; label: string | null; guestCount: number | null; openedAt: string }[];
}
export function TableGuestsDialog({ table, onClose }: { table: { id: string; number: string } | null; onClose: () => void }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [data, setData] = useState<History | null>(null), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string,string>>({});
  useEffect(() => { setFrom(''); setTo(''); setData(null); setCounts({}); }, [table?.id]);
  useEffect(() => {
    if (!table) return;
    let active = true; setError(''); setData(null);
    api.get(`/tables/${table.id}/guests`, { params: { from: from || undefined, to: to || undefined } }).then(res => { if (active) { setData(res.data.data); setCounts(Object.fromEntries(res.data.data.openSessions.map((s: History['openSessions'][number]) => [s.id, s.guestCount == null ? '' : String(s.guestCount)]))); } }).catch(err => { if (active) setError(err.response?.data?.error ?? 'No se pudo cargar el historial.'); });
    return () => { active = false; };
  }, [table?.id, from, to, refresh]);
  async function save(id: string) {
    setBusy(true); setError('');
    try { await api.patch(`/table-sessions/${id}/guests`, { guestCount: Number(counts[id]) }); setRefresh(v => v + 1); }
    catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <Dialog open={!!table} onOpenChange={open => !open && onClose()}><DialogContent className="max-w-xl max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Comensales · Mesa {table?.number}</DialogTitle></DialogHeader>
    <p className="text-muted-foreground text-base">Cuenta visitas de personas, no clientes únicos. Las cuentas antiguas sin cantidad registrada no se suman. Fecha según apertura de cuenta, hora de Caracas.</p>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block w-full rounded-xl border p-2 text-base"/></label><label className="text-sm font-medium">Hasta<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="block w-full rounded-xl border p-2 text-base"/></label></div>
    <p className="text-muted-foreground text-xs">Para consultar un día exacto, selecciona la misma fecha en ambos campos.</p>
    <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="text-sm text-brand-600">Ver todo el historial</button>
    {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
    {!data && !error && <p role="status">Cargando historial…</p>}
    {data && <><div className="grid grid-cols-2 gap-3 rounded-2xl bg-accent p-4"><div>Acumulado histórico<strong className="block text-2xl">{data.total}</strong></div><div>Período seleccionado<strong className="block text-2xl">{data.filtered}</strong></div></div>
      <h3 className="font-semibold">Registrar en cuentas abiertas</h3>
      {!data.openSessions.length && <p className="text-muted-foreground text-base">No hay cuentas abiertas en esta mesa.</p>}
      {data.openSessions.map((s,i) => <form key={s.id} onSubmit={e => { e.preventDefault(); void save(s.id); }} className="flex flex-wrap items-center gap-2 rounded-xl border p-3"><label className="flex-1 text-sm font-medium">{s.label ?? `Cuenta ${i+1}`}<input aria-label={`Comensales ${s.label ?? i+1}`} type="number" min={1} max={500} required value={counts[s.id] ?? ''} onChange={e => setCounts(v => ({...v,[s.id]:e.target.value}))} placeholder="Sin registrar" className="mt-1 block w-full rounded-lg border p-2 text-base"/></label><button disabled={busy} className="rounded-xl bg-brand-950 px-4 py-3 text-sm text-white disabled:opacity-50">Guardar</button></form>)}
      <h3 className="font-semibold">Visitas registradas ({data.visits})</h3>
      <p className="text-muted-foreground text-xs">Últimas 100 cuentas del período. El total incluye todas. Actualizar una cuenta reemplaza su cantidad, no la suma de nuevo.</p>
      <ul className="divide-y">{data.entries.map(s => <li key={s.id} className="flex justify-between gap-3 py-3 text-sm"><span>{new Date(s.openedAt).toLocaleString('es-VE',{timeZone:'America/Caracas'})}</span><strong>{s.guestCount} personas</strong></li>)}</ul>
      {!data.entries.length && <p className="text-muted-foreground text-base">Sin comensales registrados en este período.</p>}
    </>}
  </DialogContent></Dialog>;
}

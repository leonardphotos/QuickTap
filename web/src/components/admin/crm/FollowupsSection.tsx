import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { ShopCustomerSearch, type ShopCustomerChoice } from '@/pages/admin/shop/ShopCustomerSearch';
import { waPhone } from '@/utils/waPhone';
import { TextureButton } from '@/components/ui/texture-button';

const STAGES = { NEW: 'Nuevo contacto', CONTACTED: 'Contactado', QUOTED: 'Cotización enviada', NEGOTIATING: 'En negociación', WON: 'Cliente ganado', LOST: 'No interesado' };
type Stage = keyof typeof STAGES;
interface Followup { id: string; note: string; stage: Stage; nextContactAt: string | null; completedAt: string | null; createdAt: string; actorName: string; customer: { id: string; name: string; phone: string; commercialStage: Stage } }
const field = 'w-full rounded-xl border border-brand-950/15 bg-white px-3 py-2.5 text-sm';

/** Agenda manual de seguimiento. No envía mensajes automáticos ni marca ventas como cobradas. */
export function FollowupsSection() {
  const [customer, setCustomer] = useState<ShopCustomerChoice | null>(null);
  const [note, setNote] = useState('');
  const [stage, setStage] = useState<Stage>('CONTACTED');
  const [date, setDate] = useState('');
  const [pending, setPending] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Followup[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    api.get('/customers/followups/list', { params: { pending: String(pending), page, customerId: customer?.id } })
      .then(r => { if (active) { setRows(r.data.data.rows); setHasMore(r.data.data.hasMore); } })
      .catch(() => { if (active) setError('No se pudieron cargar los seguimientos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pending,page,refresh,customer?.id]);
  async function save() {
    if (!customer || !note.trim()) { setError('Selecciona un cliente y escribe una nota de seguimiento.'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/customers/${customer.id}/followups`, { note, stage, nextContactAt: date ? new Date(date).toISOString() : null });
      setNote(''); setDate(''); setPage(1); setPending(false); setRefresh(n => n+1);
    } catch { setError('No se pudo guardar el seguimiento. Revisa los campos e inténtalo de nuevo.'); }
    finally { setSaving(false); }
  }
  async function complete(id: string) {
    setSaving(true); setError('');
    try { await api.patch(`/customers/followups/${id}/complete`); setRefresh(n => n+1); }
    catch { setError('No se pudo completar el seguimiento.'); }
    finally { setSaving(false); }
  }
  return <section className="space-y-5">
    <div><h2 className="text-xl font-bold text-brand-950">Seguimiento comercial</h2><p className="mt-1 text-brand-950/60 text-base">Registra conversaciones y organiza el próximo contacto con cada cliente. Los pendientes vencidos aparecen primero.</p></div>
    <div className="rounded-2xl border border-brand-950/10 bg-white p-4 sm:p-5 space-y-3">
      <ShopCustomerSearch onSelect={c => { setCustomer(c); setPage(1); }} />
      {customer ? <div className="flex justify-between gap-3 text-sm"><span className="font-bold">{customer.name} · {customer.phone}</span><button type="button" onClick={() => { setCustomer(null); setPage(1); }} className="text-brand-500">Ver todos</button></div> : <p className="text-brand-950/50 text-base">Selecciona un cliente registrado. Puedes crear su ficha desde Clientes.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Etapa comercial<select className={`${field} mt-1`} value={stage} onChange={e => setStage(e.target.value as Stage)}>{Object.entries(STAGES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-sm font-medium">Próximo contacto (opcional)<input type="datetime-local" className={`${field} mt-1`} value={date} onChange={e => setDate(e.target.value)} /><span className="text-xs text-brand-950/50">Hora local de este dispositivo.</span></label>
      </div>
      <textarea aria-label="Nota del contacto" maxLength={2000} rows={3} placeholder="¿Qué conversaron? ¿Cuál es el siguiente paso?" value={note} onChange={e => setNote(e.target.value)} className={field} />
      <TextureButton variant="brand" className="!w-auto" disabled={saving || !customer} onClick={save}>{saving ? 'Guardando…' : 'Registrar seguimiento'}</TextureButton>
    </div>
    <div className="flex flex-wrap gap-2">{[true,false].map(value => <button type="button" key={String(value)} onClick={() => { setPending(value); setPage(1); }} className={`rounded-full px-4 py-2 text-sm font-semibold ${pending === value ? 'bg-brand-500 text-white' : 'bg-white text-brand-950'}`}>{value ? 'Pendientes' : 'Historial de contactos'}</button>)}</div>
    {error && <p role="alert" className="text-red-600 text-base">{error} <button onClick={() => setRefresh(n => n+1)}>Reintentar</button></p>}
    {loading ? <p className="text-base">Cargando seguimientos…</p> : !error && <div className="space-y-3">
      {!rows.length && <p className="rounded-2xl border p-5 text-brand-950/60 text-base">No hay seguimientos en esta vista.</p>}
      {rows.map(row => <article key={row.id} className="rounded-2xl border border-brand-950/10 bg-white p-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2"><strong>{row.customer.name}</strong><span className="text-xs text-brand-950/60">Etapa actual: {STAGES[row.customer.commercialStage] ?? row.customer.commercialStage}</span></div>
        <p className="whitespace-pre-wrap text-base">{row.note}</p>
        <p className="text-brand-950/50 text-xs">{row.actorName} · {new Date(row.createdAt).toLocaleString('es-VE')} · {STAGES[row.stage]}</p>
        {row.nextContactAt && <p className={`text-sm ${!row.completedAt && new Date(row.nextContactAt) < new Date() ? 'text-amber-700' : 'text-brand-950/70'}`}>{row.completedAt ? 'Completado' : 'Próximo contacto'}: {new Date(row.completedAt || row.nextContactAt).toLocaleString('es-VE')}</p>}
        <div className="flex gap-4 text-sm"><a href={`https://wa.me/${waPhone(row.customer.phone)}`} target="_blank" rel="noreferrer" className="py-2 text-brand-500">Abrir WhatsApp</a>{row.nextContactAt && !row.completedAt && <button type="button" disabled={saving} onClick={() => complete(row.id)} className="py-2 font-semibold text-brand-500">Marcar completado</button>}</div>
      </article>)}
      <div className="flex justify-between"><button disabled={page === 1} onClick={() => setPage(n => n-1)} className="disabled:opacity-30">Anterior</button><span className="text-sm">Página {page}</span><button disabled={!hasMore} onClick={() => setPage(n => n+1)} className="disabled:opacity-30">Siguiente</button></div>
    </div>}
  </section>;
}

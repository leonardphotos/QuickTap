import { AnimatedTabs, AnimatedTab } from '@/components/ui/animated-tabs';
import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, RefreshCw, Target, Users, Wallet } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { RecurringExpenses } from '@/components/master/RecurringExpenses';
import { masterApi } from '@/api/client';
import { useMasterAuth } from '@/context/MasterAuthContext.shared';
import { MaskedAmount } from '@/components/master/MaskedAmount';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Kind = 'INCOME' | 'EXPENSE' | 'PAYROLL';
interface Entry { id: string; kind: Kind; status: string; description: string; category: string; amountEur: string; occurredAt: string; costType: string; employeeName: string | null; clientName: string | null; reference: string | null; note: string | null; voidReason: string | null }
interface Overview {
  month: string;
  unvaluedPayments: number;
  totals: { income: number; fixed: number; variable: number; breakEven: number | null; gap: number | null; contributionRatio: number | null; paidCosts: number; cashBalance: number; pendingCosts: number; payroll: number };
  ranking: { id: string; name: string; amount: number; payments: number }[];
  clients: { id: string; name: string; periodEnd: string; paidInPeriod: number; pendingVerification: boolean }[];
  entries: Entry[];
  subscriptions: { id: string; priceUsd: string; createdAt: string; approvedAt: string | null; paymentReference: string; kind: string; restaurant: { id: string; name: string } | null }[];
}
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const euro = (value: number | string) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'EUR' }).format(Number(value));
const dateLabel = (value: string) => new Date(value).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
const money = (value: number | string) => <MaskedAmount value={euro(value)} />;
const box = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm';
const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50';
const kindLabel: Record<Kind, string> = { INCOME: 'Ingreso', EXPENSE: 'Gasto', PAYROLL: 'Nómina' };
function errorMessage(error: unknown) { return (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'No se pudo completar la operación. Intenta nuevamente.'; }

export default function MasterAdministrationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { admin } = useMasterAuth();
  const canWrite = !!admin && ['ADMIN', 'MANAGER', 'FINANCE'].includes(admin.role);
  const [month, setMonth] = useState(day().slice(0, 7));
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<'Resumen' | 'Ingresos' | 'Clientes' | 'Gastos' | 'Recurrentes' | 'Nómina'>(searchParams.get('tab') === 'recurrentes' ? 'Recurrentes' : 'Resumen');
  useEffect(() => { if (searchParams.get('tab') === 'recurrentes') setTab('Recurrentes'); }, [searchParams]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('master-expenses-changed', refresh);
    return () => window.removeEventListener('master-expenses-changed', refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null);
    masterApi.get('/master/administration', { params: { month } }).then(response => { if (active) setData(response.data.data); })
      .catch(error => { if (active) setError(errorMessage(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, revision]);
  async function mutate(id: string, action: 'pay' | 'void') {
    const reason = action === 'void' ? window.prompt('Motivo de anulación (mínimo 5 caracteres). El registro se conservará.') : undefined;
    if (action === 'void' && (!reason || reason.trim().length < 5)) return;
    if (action === 'pay' && !window.confirm('¿Confirmas que este importe ya fue pagado?')) return;
    setBusy(true); setError('');
    try { await masterApi.post(`/master/administration/entries/${id}/${action}`, { reason }); window.dispatchEvent(new Event('master-expenses-changed')); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  const t = data?.totals;
  const shownEntries = data?.entries.filter(row => tab === 'Ingresos' ? row.kind === 'INCOME' : tab === 'Gastos' ? row.kind === 'EXPENSE' : row.kind === 'PAYROLL') ?? [];
  return <div className="space-y-6 text-brand-950">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand-950 p-6 text-white">
      <div><p className="font-semibold uppercase tracking-[.18em] text-sky-300 text-xs">Finanzas de QuickTap</p><h1 className="mt-2 text-3xl font-bold">Administración</h1><p className="mt-2 text-white/70 text-base">Todo lo que entra, lo que sale y lo que necesitas para crecer.</p></div>
      {canWrite && <div className="flex gap-3"><button className={`${button} bg-sky-500 text-white`} onClick={() => setKind('INCOME')}><Plus size={18} />Ingreso</button><button className={`${button} bg-white text-brand-950`} onClick={() => setKind('EXPENSE')}><ArrowUpRight size={18} />Gastos</button></div>}
    </header>
    <div className="flex flex-wrap items-end justify-between gap-3"><AnimatedTabs tone="dark" aria-label="Secciones de administración" className="flex flex-nowrap gap-2">{(['Resumen', 'Ingresos', 'Clientes', 'Gastos', 'Recurrentes', 'Nómina'] as const).map(item => <AnimatedTab active={tab === item} key={item} onClick={() => { setTab(item); setSearchParams(item === 'Recurrentes' ? { tab: 'recurrentes' } : {}, { replace: true }); }} aria-pressed={tab === item} className={`${button} ${tab === item ? 'bg-brand-950 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{item}</AnimatedTab>)}</AnimatedTabs><div className="flex items-end gap-2"><label className="text-gray-700 text-sm font-medium">Período (Caracas)<input aria-label="Mes del informe" className={inputClass} type="month" value={month} min="2000-01" max="2099-12" onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label><button aria-label="Actualizar" className={`${button} bg-white border border-slate-200`} disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} /></button></div></div>
    {tab === 'Recurrentes' && <RecurringExpenses canWrite={canWrite} />}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700 text-base">{error}</p>}
    {loading && <p role="status" className={box}>Preparando tus cifras…</p>}
    {data && t && <>
      {data.unvaluedPayments > 0 && <p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-900 text-base">Hay {data.unvaluedPayments} pagos aprobados por WhatsApp sin monto registrado. No están sumados; revisa sus comprobantes antes de registrarlos manualmente.</p>}
      {tab === 'Resumen' && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
          { label: 'Ingresos registrados', value: t.income, icon: ArrowDownLeft },
          { label: 'Gastos y nómina pagados', value: t.paidCosts, icon: ArrowUpRight },
          { label: 'Resultado registrado', value: t.cashBalance, icon: Wallet },
          { label: 'Por pagar', value: t.pendingCosts, icon: Users },
        ].map(card => <section key={card.label} className={box}><card.icon size={22} className="mb-4 text-brand-500" /><p className="text-gray-900 text-base">{card.label}</p><p className="mt-2 text-2xl font-bold">{money(card.value)}</p></section>)}</div>
        <div className="grid items-start gap-5 xl:grid-cols-2"><section className={box}><div className="flex items-center gap-2"><Target className="text-brand-500" /><h2 className="text-lg font-bold">Punto de equilibrio mensual</h2></div><p className="mt-4 text-3xl font-bold">{t.breakEven === null ? 'No calculable' : money(t.breakEven)}</p><p className="mt-2 text-gray-900 text-base">{t.breakEven === null ? 'Los costos variables alcanzan los ingresos, o faltan ingresos para estimar el margen.' : t.fixed + t.variable === 0 ? 'Registra los costos del mes para obtener una meta útil.' : t.gap === 0 ? 'Los ingresos registrados cubren la meta estimada.' : <>Faltan {money(t.gap ?? 0)} para cubrir la meta estimada.</>}</p><dl className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><dt>Costos fijos (incluye nómina)</dt><dd>{money(t.fixed)}</dd></div><div className="flex justify-between"><dt>Costos variables</dt><dd>{money(t.variable)}</dd></div></dl><p className="mt-5 border-t pt-4 leading-relaxed text-gray-500 text-xs">Estimación: costos fijos ÷ (1 − costos variables / ingresos). Incluye costos pendientes del período. Los recurrentes se incorporan al entrar en su ventana de aviso (5 días antes); el presupuesto mensual completo está en Recurrentes. Registra por separado los gastos no recurrentes. Sin ingresos ni costos variables, la meta equivale a los costos fijos.</p></section>
        <section className={box}><h2 className="text-lg font-bold">Clientes que más ingresos generan</h2><p className="mt-1 text-gray-900 text-base">Membresías aprobadas y otros ingresos vinculados del período.</p>{data.ranking.length === 0 ? <p className="py-8 text-gray-900 text-base">Aún no hay ingresos vinculados a clientes este mes.</p> : <ol className="mt-4 divide-y">{data.ranking.slice(0, 5).map((row, index) => <li key={row.id} className="flex items-center gap-3 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 font-bold text-brand-500">{index + 1}</span><Link to={`/master/restaurants/${row.id}`} className="min-w-0 flex-1 truncate font-medium">{row.name}</Link><span className="font-bold">{money(row.amount)}</span></li>)}</ol>}<button onClick={() => setTab('Clientes')} className="mt-3 text-sm font-semibold text-brand-500">Ver todos los clientes →</button></section></div>
        <p className="text-gray-500 text-xs">Moneda de control: EUR. Resultado registrado = ingresos − gastos y nómina pagados asignados al período; no es un saldo bancario. Los abonos de membresía pendientes de aprobación no se suman como ingresos.</p>
      </>}
      {tab === 'Clientes' && <section className={box}><h2 className="text-lg font-bold">Control de pagos por cliente</h2><p className="mt-1 text-gray-900 text-base">No registrar pagos este mes no significa tener deuda: revisa también el vencimiento.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Cliente</th><th>Ingresos del período</th><th>Verificación</th><th>Vencimiento</th></tr></thead><tbody>{[...data.clients].sort((a,b) => b.paidInPeriod - a.paidInPeriod).map(client => <tr key={client.id} className="border-b last:border-0"><td className="p-3"><Link className="font-semibold text-brand-500" to={`/master/restaurants/${client.id}`}>{client.name}</Link></td><td>{money(client.paidInPeriod)}</td><td>{client.pendingVerification ? <Link to="/master/proofs">Pago por verificar</Link> : client.paidInPeriod > 0 ? 'Pago registrado' : 'Sin pagos este mes'}</td><td>{dateLabel(client.periodEnd)}</td></tr>)}</tbody></table></div></section>}
      {['Ingresos', 'Gastos', 'Nómina'].includes(tab) && <section className={box}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{tab}</h2>{canWrite && <button className={`${button} bg-sky-500 text-white`} onClick={() => setKind(tab === 'Ingresos' ? 'INCOME' : tab === 'Gastos' ? 'EXPENSE' : 'PAYROLL')}><Plus size={16} />{tab === 'Nómina' ? 'Registrar nómina' : tab === 'Ingresos' ? 'Otro ingreso' : 'Agregar gasto'}</button>}</div>
        {tab === 'Ingresos' && <><p className="my-4 text-gray-900 text-base">Las membresías aprobadas aparecen automáticamente. No vuelvas a cargarlas como ingreso manual. <Link className="text-brand-500 underline" to="/master/proofs">Verificar pagos</Link></p>{data.subscriptions.map(row => <article className="flex flex-wrap justify-between gap-2 border-b py-4" key={row.id}><div><p className="font-semibold text-base">{row.restaurant?.name ?? 'Cliente'} · Membresía</p><p className="text-gray-500 text-xs">{dateLabel(row.approvedAt ?? row.createdAt)} · {row.approvedAt ? 'Aprobado' : 'Histórico: fecha de solicitud'} · Ref. {row.paymentReference}</p></div><strong>{money(row.priceUsd)}</strong></article>)}</>}
        {tab === 'Nómina' && <p className="my-4 text-gray-900 text-base">Registra cada empleado, concepto y monto del mes. Los pendientes se incluyen en la meta de equilibrio; al confirmar el pago se descuentan del resultado. No se calculan deducciones laborales automáticamente.</p>}
        {shownEntries.map(row => <article className="flex flex-wrap items-center justify-between gap-3 border-b py-4 last:border-0" key={row.id}><div className="min-w-0"><p className="font-semibold text-base">{row.employeeName ? `${row.employeeName} · ` : ''}{row.description}</p><p className="mt-1 text-gray-500 text-xs">{dateLabel(row.occurredAt)} · {row.category} {row.kind !== 'INCOME' ? `· ${row.costType === 'FIXED' ? 'Fijo' : 'Variable'}` : ''}{row.clientName ? ` · ${row.clientName}` : ''} · {row.status === 'PAID' ? 'Pagado' : row.status === 'VOID' ? 'Anulado' : 'Pendiente'}</p>{row.reference && <p className="text-gray-500 text-xs">Referencia: {row.reference}</p>}{row.note && <p className="mt-1 text-gray-500 text-xs">{row.note}</p>}{row.voidReason && <p className="text-red-600 text-xs">Motivo: {row.voidReason}</p>}</div><div className="flex flex-wrap items-center gap-3"><strong className={row.status === 'VOID' ? 'line-through opacity-50' : ''}>{money(row.amountEur)}</strong>{canWrite && row.status === 'PENDING' && <button disabled={busy} onClick={() => void mutate(row.id, 'pay')} className="text-sm font-semibold text-brand-500">Marcar pagado</button>}{canWrite && row.status !== 'VOID' && <button disabled={busy} onClick={() => void mutate(row.id, 'void')} className="text-xs text-red-600">Anular</button>}</div></article>)}
        {shownEntries.length === 0 && (tab !== 'Ingresos' || data.subscriptions.length === 0) && <p className="py-10 text-center text-gray-900 text-base">No hay registros en este período.</p>}
      </section>}
    </>}
    {kind && <EntryDialog kind={kind} clients={data?.clients ?? []} onClose={() => setKind(null)} onSaved={() => { setKind(null); setRevision(value => value + 1); }} />}
  </div>;
}

function EntryDialog({ kind, clients, onClose, onSaved }: { kind: Kind; clients: Overview['clients']; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { await masterApi.post('/master/administration/entries', {
      kind, description: form.get('description'), category: form.get('category'), amountEur: Number(form.get('amountEur')), date: form.get('date'),
      status: kind === 'INCOME' ? 'PAID' : form.get('status'), costType: kind === 'INCOME' ? 'FIXED' : form.get('costType'),
      clientId: form.get('clientId') || undefined, employeeName: form.get('employeeName') || undefined, reference: form.get('reference') || undefined, note: form.get('note') || undefined,
    }); onSaved(); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Registrar {kindLabel[kind].toLowerCase()}</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4 text-sm">
    {kind === 'INCOME' && <p className="rounded-xl bg-sky-50 p-3 text-sky-800 text-base">Solo otros ingresos (instalación, capacitación, etc.). Las membresías se incorporan al aprobarlas.</p>}
    {kind === 'PAYROLL' && <label className="block text-sm font-medium">Empleado<input name="employeeName" className={inputClass} required maxLength={120} placeholder="Nombre y apellido" /></label>}
    <label className="block text-sm font-medium">Concepto<input name="description" className={inputClass} required minLength={2} maxLength={200} placeholder={kind === 'PAYROLL' ? 'Sueldo, bono o comisión' : 'Describe el movimiento'} /></label>
    <div className="grid grid-cols-2 gap-3"><label>Monto en EUR<input name="amountEur" type="number" inputMode="decimal" min="0.01" max="999999999" step="0.01" required className={inputClass} /></label><label>Fecha del período<input name="date" type="date" defaultValue={day()} required className={inputClass} /></label></div>
    <label className="block text-sm font-medium">Categoría<input name="category" className={inputClass} defaultValue={kind === 'PAYROLL' ? 'Nómina' : ''} placeholder="Servidor, personal, instalación…" required minLength={2} maxLength={80} /></label>
    {kind === 'INCOME' && <label className="block text-sm font-medium">Cliente (opcional)<select name="clientId" className={inputClass}><option value="">Sin cliente vinculado</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
    {kind !== 'INCOME' && <div className="grid grid-cols-2 gap-3"><label>Estado<select name="status" className={inputClass}><option value="PENDING">Pendiente por pagar</option><option value="PAID">Ya pagado</option></select></label><label>Tipo de costo<select name="costType" className={inputClass}><option value="FIXED">Fijo</option><option value="VARIABLE">Variable</option></select></label></div>}
    <label className="block text-sm font-medium">Referencia (opcional)<input name="reference" className={inputClass} maxLength={120} /></label><label className="block text-sm font-medium">Nota (opcional)<textarea name="note" className={inputClass} maxLength={1000} rows={2} /></label>
    {error && <p role="alert" className="text-red-600 text-base">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className={`${button} bg-slate-100`}>Cancelar</button><button disabled={busy} className={`${button} bg-sky-500 text-white`}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
  </form></DialogContent></Dialog>;
}

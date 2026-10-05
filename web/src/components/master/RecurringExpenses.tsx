import { useEffect, useState } from 'react';
import { BellRing, Plus, Repeat2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { MaskedAmount } from './MaskedAmount';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Expense { id: string; name: string; amountEur: string; category: string; billingDay: number; nextDueAt: string; active: boolean; note: string | null }
interface Alert { id: string; description: string; amountEur: string; occurredAt: string; daysUntilDue: number }
interface Data { expenses: Expense[]; alerts: Alert[]; monthlyBudgetEur: number; dueSoonEur: number; overdueEur: number; pendingEur: number }
const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50';
const today = () => new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
const money = (value: number | string) => <MaskedAmount value={new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'EUR' }).format(Number(value))} />;
const date = (value: string) => new Date(value).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
const due = (days: number) => days < 0 ? `Vencido hace ${-days} día${days === -1 ? '' : 's'}` : days === 0 ? 'Vence hoy' : `Vence en ${days} día${days === 1 ? '' : 's'}`;
const changed = () => window.dispatchEvent(new Event('master-expenses-changed'));
const message = (error: unknown) => (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'No se pudieron actualizar los gastos. Intenta nuevamente.';

export function RecurringExpenses({ compact = false, canWrite = false }: { compact?: boolean; canWrite?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let request = 0;
    const load = async () => {
      const sequence = ++request;
      try { const response = await masterApi.get('/master/administration/recurring'); if (active && sequence === request) { setData(response.data.data); setError(''); } }
      catch (error) { if (active && sequence === request) setError(message(error)); }
    };
    void load();
    const refresh = () => { void load(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh); window.addEventListener('master-expenses-changed', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('master-expenses-changed', refresh); };
  }, [revision]);
  async function act(id: string, action: 'pay' | 'pause' | 'void') {
    const reason = action === 'void' ? window.prompt('Motivo para anular este vencimiento (mínimo 5 caracteres):') : undefined;
    if (action === 'void' && (!reason || reason.trim().length < 5)) return;
    if (action !== 'void' && !window.confirm(action === 'pay' ? '¿Confirmas que ya pagaste este gasto? Se registrará una sola vez en Administración.' : '¿Desactivar la repetición mensual? Los vencimientos ya registrados se conservan; puedes pagarlos o anularlos.')) return;
    setBusy(true); setError('');
    try { await masterApi.post(`/master/administration/${action === 'pause' ? 'recurring' : 'entries'}/${id}/${action}`, { reason }); changed(); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  if (compact) {
    if (error) return <p role="status" className="mb-4 text-amber-800 text-base">No se pudieron comprobar los avisos de gastos. <Link className="underline" to="/master/administration?tab=recurrentes">Revisar gastos</Link></p>;
    if (!data?.alerts.length) return null;
    return <section role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <div className="flex flex-wrap items-center gap-3"><BellRing size={20} /><div className="min-w-0 flex-1"><p className="font-semibold text-base">Tienes {data.alerts.length} pago{data.alerts.length === 1 ? '' : 's'} recurrente{data.alerts.length === 1 ? '' : 's'} pendiente{data.alerts.length === 1 ? '' : 's'}</p><p className="mt-1 text-base">{data.alerts.slice(0, 3).map(row => `${row.description} · ${due(row.daysUntilDue)}`).join(' / ')}</p><p className="mt-1 text-base">Reserva {money(data.pendingEur)} para cubrirlos. Incluye vencidos.</p></div><Link to="/master/administration?tab=recurrentes" className={`${button} bg-white`}>Ver pagos</Link></div>
    </section>;
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Repeat2 size={22} className="text-brand-500" />Gastos recurrentes</h2><p className="mt-1 text-gray-900 text-base">VPS, VPN, ChatGPT y otros pagos mensuales de QuickTap.</p></div>{canWrite && <button className={`${button} bg-sky-500 text-white`} onClick={() => setAdding(true)}><Plus size={17} />Nuevo gasto mensual</button>}</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700 text-base">{error} <button className="underline" onClick={() => setRevision(value => value + 1)}>Reintentar</button></p>}
    {!data && !error && <p role="status">Preparando tus gastos…</p>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-3">{[
        ['Presupuesto mensual activo', data.monthlyBudgetEur], ['Por pagar en los próximos 5 días', data.dueSoonEur], ['Vencidos por pagar', data.overdueEur],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-gray-900 text-base">{label}</p><p className="mt-2 text-2xl font-bold">{money(Number(value))}</p></div>)}</div>
      <p className="leading-relaxed text-gray-500 text-xs">Moneda de control: EUR. Registra el equivalente en EUR si el proveedor cobra en otra moneda. El presupuesto es la suma mensual de los gastos activos, no un saldo bancario; incluye los que empiezan más adelante. Los avisos se muestran desde 5 días antes (hora de Caracas), no se envían por WhatsApp.</p>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Pagos que debes atender</h3>{!data.alerts.length && <p className="py-5 text-gray-900 text-base">Estás al día. No hay vencidos ni pagos pendientes para los próximos 5 días.</p>}
        {data.alerts.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0"><div><p className="font-semibold text-base">{row.description}</p><p className={`mt-1 text-xs ${row.daysUntilDue < 0 ? 'text-red-600' : 'text-amber-700'}`}>{due(row.daysUntilDue)} · {date(row.occurredAt)}</p></div><div className="flex flex-wrap items-center gap-3"><strong>{money(row.amountEur)}</strong>{canWrite && <><button disabled={busy} className={`${button} bg-sky-50 text-sky-700`} onClick={() => void act(row.id, 'pay')}>Marcar pagado</button><button disabled={busy} className="text-xs text-red-600" onClick={() => void act(row.id, 'void')}>Anular</button></>}</div></article>)}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Tus compromisos mensuales</h3>{!data.expenses.length && <p className="py-5 text-gray-900 text-base">Añade el primer servicio con su importe y fecha de vencimiento.</p>}
        {data.expenses.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0"><div><p className="font-semibold text-base">{row.name} {!row.active && <span className="text-xs font-normal text-slate-400">· Desactivado</span>}</p><p className="mt-1 text-gray-500 text-xs">{row.category} · Día {row.billingDay} de cada mes{row.active ? ` · Siguiente vencimiento por generar: ${date(row.nextDueAt)}` : ''}</p>{row.note && <p className="mt-1 text-gray-500 text-xs">{row.note}</p>}</div><div className="flex items-center gap-3"><span className="font-semibold">{money(row.amountEur)} / mes</span>{canWrite && row.active && <button disabled={busy} className="text-sm text-slate-500" onClick={() => void act(row.id, 'pause')}>Desactivar</button>}</div></article>)}
        <p className="mt-3 text-gray-500 text-xs">Si el mes no tiene el día elegido, se usa su último día. Los pagos y anulaciones quedan en Gastos, sin duplicar el movimiento. Desactivar detiene nuevos vencimientos, no borra los ya registrados.</p>
      </section>
    </>}
    {adding && <RecurringExpenseDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />}
  </div>;
}

function RecurringExpenseDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try { await masterApi.post('/master/administration/recurring', { name: form.get('name'), amountEur: Number(form.get('amountEur')), category: form.get('category'), firstDueDate: form.get('date'), note: form.get('note') || undefined }); onSaved(); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Nuevo gasto mensual</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4 text-sm">
    <label className="block text-sm font-medium">Servicio o concepto<input name="name" required minLength={2} maxLength={200} className={input} placeholder="Ej.: VPS, VPN, ChatGPT" /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label>Monto mensual en EUR<input name="amountEur" type="number" inputMode="decimal" min="0.01" max="999999999" step="0.01" required className={input} /></label><label>Primer vencimiento pendiente<input name="date" type="date" min={today()} max="2099-12-31" defaultValue={today()} required className={input} /></label></div>
    <label className="block text-sm font-medium">Categoría<input name="category" required minLength={2} maxLength={80} defaultValue="Tecnología" className={input} /></label>
    <label className="block text-sm font-medium">Nota (opcional)<textarea name="note" maxLength={1000} rows={2} className={input} placeholder="Proveedor o detalles útiles para el pago" /></label>
    <p className="rounded-xl bg-sky-50 p-3 text-sky-900 text-xs">Se repetirá cada mes. Si ya pagaste este mes, selecciona el próximo vencimiento. Verás un aviso en el Máster desde 5 días antes, hasta marcarlo como pagado. No se realizan cobros automáticos.</p>
    {error && <p role="alert" className="text-red-600 text-base">{error}</p>}<div className="flex justify-end gap-2"><button disabled={busy} type="button" onClick={onClose} className={`${button} bg-slate-100`}>Cancelar</button><button disabled={busy} className={`${button} bg-sky-500 text-white`}>{busy ? 'Guardando…' : 'Guardar gasto'}</button></div>
  </form></DialogContent></Dialog>;
}

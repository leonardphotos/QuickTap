import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { formatBase } from '@/utils/format';

type Person = { name: string; kind?: string; orders: number; amount: number };
type Removal = { id: string; orderNumber: number; productName: string; variantName?: string | null; quantity: number; amountBase: number; reason: string; removedByName?: string | null; createdAt: string };
type Operations = { couriers: Person[]; consumptions: Person[]; removals: Removal[]; removalTotal: number };
type Inventory = { rawMaterial: number; headquarters: number; missingCosts: number } | null;
type Report = Operations & { from: string; to: string; currency: string; total: number; store: number; table: number; express: number; bar: number; delivery: number; pickup: number; purchases: number; opening: Inventory; closing: Inventory; top: { name: string; quantity: number }[]; bottom: { name: string; quantity: number }[] };
export function WeeklyReports({ range, from, to, symbol }: { range: string; from: string; to: string; symbol: string }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError(''); setOperations(null);
    Promise.all([api.get('/kpis/weekly'), api.get('/kpis/operations', { params: { range, from: from || undefined, to: to || undefined } })])
      .then(([weeks, ops]) => { if (active) { setReports(weeks.data.data.map((r: { report: Report }) => r.report)); setOperations(ops.data.data); setSelected(0); } })
      .catch(() => { if (active) setError('No se pudieron cargar los reportes. Actualiza la página para reintentar.'); });
    return () => { active = false; };
  }, [range, from, to]);
  const report = reports[selected];
  const reportSymbol = report?.currency === 'EUR' ? '€' : '$';
  const date = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
  const people = (title: string, rows: Person[]) => <section className="rounded-2xl border border-brand-950/10 p-4 bg-white">
    <h3 className="font-semibold mb-3">{title}</h3>
    {rows.length === 0 ? <p className="text-brand-950/50 text-base">Sin movimientos en el período.</p> : rows.map((p,i) => <div key={i} className="flex justify-between gap-3 py-2 border-t border-brand-950/5 text-sm"><span>{p.name}{p.kind ? ` · ${p.kind}` : ''}</span><span>{p.orders} pedidos · {formatBase(p.amount,symbol)}</span></div>)}
  </section>;
  const inventory = (title: string, value: Inventory) => <div className="rounded-xl bg-brand-950/[0.03] p-3"><h4 className="font-medium">{title}</h4>{value ? <>
    <p>Materia prima: {formatBase(value.rawMaterial,reportSymbol)}</p><p>Casa Matriz: {formatBase(value.headquarters,reportSymbol)}</p>
    <p>Total: {formatBase(value.rawMaterial+value.headquarters,reportSymbol)}</p>
    {value.missingCosts > 0 && <p className="text-amber-700 text-base">Valoración incompleta: {value.missingCosts} insumos sin costo.</p>}
  </> : <p>Sin registro histórico para esta fecha.</p>}</div>;
  return <div className="space-y-4">
    {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
    {operations && <div className="grid gap-4 lg:grid-cols-2">{people('Motorizados · entregas completadas',operations.couriers)}{people('Consumos de socios y empleados',operations.consumptions)}</div>}
    {operations && <section className="rounded-2xl border border-brand-950/10 p-4 bg-white">
      <div className="flex items-center justify-between gap-3 mb-3"><h3 className="font-semibold">Productos eliminados de comandas</h3><span className="text-sm font-semibold text-red-600">{formatBase(operations.removalTotal,symbol)}</span></div>
      {operations.removals.length === 0 ? <p className="text-brand-950/50 text-base">Sin eliminaciones en el período.</p> : <div className="divide-y divide-brand-950/5">{operations.removals.map((r) => <div key={r.id} className="grid gap-1 py-2 text-sm md:grid-cols-[1fr_auto]">
        <span><strong>#{r.orderNumber}</strong> · {r.quantity}× {r.productName}{r.variantName ? ` · ${r.variantName}` : ''}</span>
        <span className="font-medium">{formatBase(r.amountBase,symbol)}</span>
        <span className="text-brand-950/55 md:col-span-2">{r.reason} · {r.removedByName ?? 'Usuario'} · {new Date(r.createdAt).toLocaleString('es-VE')}</span>
      </div>)}</div>}
    </section>}
    <section className="rounded-2xl border border-brand-950/10 bg-white p-4 space-y-4">
      <h3 className="font-semibold">Reportes semanales</h3>
      <p className="text-brand-950/60 text-base">Generados cada lunes. Período: lunes a domingo, hora de Venezuela. Consumos internos separados de las ventas.</p>
      {!report ? <p className="text-base">El reporte aparecerá cuando se complete la generación semanal.</p> : <>
        <select aria-label="Semana del reporte" className="border rounded-lg p-2 max-w-full text-base" value={selected} onChange={e => setSelected(Number(e.target.value))}>{reports.map((r,i) => <option key={r.from} value={i}>{date(r.from)} — {date(new Date(new Date(r.to).getTime()-1).toISOString())}</option>)}</select>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Ventas totales',report.total],['Tienda',report.store],['Delivery',report.delivery],['Pick-up',report.pickup],['Compras',report.purchases],['Mesa',report.table],['Express',report.express],['Barra',report.bar]].map(([name,value]) => <div key={name} className="bg-brand-500/5 rounded-xl p-3"><p className="text-xs">{name}</p><p className="font-semibold text-base">{formatBase(Number(value),reportSymbol)}</p></div>)}</div>
        <div className="grid gap-3 md:grid-cols-2 text-sm">{inventory('Inventario inicial',report.opening)}{inventory('Inventario final',report.closing)}</div>
        <p className="text-brand-950/50 text-xs">Casa Matriz corresponde al almacén central del grupo. Valoración por existencia × costo unitario registrado; no sumar nuevamente entre sedes.</p>
        <div className="grid gap-3 md:grid-cols-2">{[['Top 3 más vendidos',report.top],['Top 3 menos vendidos (incluye cero ventas)',report.bottom]].map(([label,rows]) => <div key={String(label)}><h4 className="font-medium text-sm">{String(label)}</h4>{(rows as Report['top']).map((p,i) => <p key={i} className="mt-2 text-base">{p.name} · {p.quantity} unidades</p>)}</div>)}</div>
      </>}
    </section>
  </div>;
}

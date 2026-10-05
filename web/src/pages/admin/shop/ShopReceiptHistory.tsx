import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShopSalePrintActions } from './ShopSalePrintActions';
import { receiptNumber } from './receiptNumber';

type Receipt = { id: string; receiptNumber: number; time: string; customerName: string | null; customerPhone: string | null; total: number; returned: boolean; printCurrency: string | null };
export function ShopReceiptHistory({ from, to, money }: { from?: string; to?: string; money: (n: number) => string }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Receipt[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Receipt | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/shop/sales/receipts', { params: { from, to, search, page } });
        if (active) { setRows(response.data.data.receipts); setMore(response.data.data.hasMore); }
      } catch { if (active) setError('No se pudieron cargar los comprobantes.'); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [from, to, search, page, retry]);
  const amount = (row: Receipt) => row.printCurrency ? `${row.printCurrency === 'EUR' ? '€' : '$'}${row.total.toFixed(2)}` : money(row.total);
  return <section className="rounded-2xl border border-brand-950/10 bg-white p-4 space-y-3">
    <h2 className="text-lg font-bold text-brand-950">Comprobantes del período</h2>
    <p className="text-brand-950/60 text-base">Busca una venta y vuelve a imprimir su nota de entrega con el mismo número de recibo.</p>
    <input type="search" aria-label="Buscar comprobante" maxLength={120} placeholder="Número de recibo, cliente o teléfono" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full rounded-xl border border-brand-950/15 px-3 py-2 text-base" />
    {loading ? <p role="status">Buscando comprobantes…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)} className="text-brand-500 underline">Reintentar</button></p> : <>
      {!rows.length && <p className="text-brand-950/60 text-base">No hay comprobantes que coincidan con la búsqueda y las fechas.</p>}
      <ul className="divide-y divide-brand-950/10">{rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="font-semibold text-base">Recibo #{receiptNumber(row)} · {amount(row)}</p><p className="text-brand-950/60 text-base">{row.customerName || 'Consumidor final'} · {new Date(row.time).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}{row.returned ? ' · Devuelta' : ''}</p></div>
        <button type="button" disabled={row.returned} onClick={() => setSelected(row)} className="min-h-11 rounded-xl border border-brand-950/15 px-4 py-2 text-sm font-semibold text-brand-500 disabled:opacity-40">Reimprimir nota</button>
      </li>)}</ul>
      <div className="flex justify-between items-center text-sm"><button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="min-h-11 disabled:opacity-40">Anterior</button><span>Página {page}</span><button type="button" disabled={!more} onClick={() => setPage(p => p + 1)} className="min-h-11 disabled:opacity-40">Siguiente</button></div>
    </>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Nota de entrega #{selected ? receiptNumber(selected) : ''}</DialogTitle></DialogHeader>
      <p className="text-base">Se imprimirá la venta completa, sin generar otro cobro ni descontar inventario. Abre la Estación de Impresión de este local.</p>
      {selected && <ShopSalePrintActions key={selected.id} saleId={selected.id} customerName={selected.customerName} noteOnly />}
    </DialogContent></Dialog>
  </section>;
}

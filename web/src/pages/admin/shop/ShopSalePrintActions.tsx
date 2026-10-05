import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { ShopCustomerSearch } from './ShopCustomerSearch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Job = { id: string; kind: string; status: string; claimedAt: string | null; result?: { numeroFactura?: string; error?: string } };
export function ShopSalePrintActions({ saleId, customerName, noteOnly = false }: { saleId: string; customerName?: string | null; noteOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customerName ?? '');
  const [rif, setRif] = useState('');
  const [tax, setTax] = useState('');
  const [medio, setMedio] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const r = await api.get(`/shop/sales/${saleId}/print-status`); if (active) setJobs(r.data.data); }
      catch { /* El error de envío se muestra al solicitar el documento. */ }
    };
    void load(); const timer = window.setInterval(load, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [saleId]);
  const fiscal = jobs.find(j => j.kind === 'FISCAL');
  async function send(kind: 'NOTE' | 'FISCAL') {
    setBusy(true); setMessage('');
    try {
      const r = await api.post(`/shop/sales/${saleId}/print`, { kind, ...(kind === 'FISCAL' ? { cliente: { rif, nombre: name }, tax, medio } : {}) });
      setJobs(previous => [r.data.data, ...previous]); setOpen(false);
      setMessage('Solicitud enviada. Mantén abierta la estación de este local.');
    } catch (e: unknown) {
      const error = e as { response?: { data?: { message?: string; error?: string } } };
      setMessage(error.response?.data?.error ?? error.response?.data?.message ?? 'No se pudo enviar. Revisa la estación e intenta de nuevo.');
    } finally { setBusy(false); }
  }
  const button = 'rounded-xl border border-brand-950/15 px-4 py-2 text-sm font-semibold text-brand-950 disabled:opacity-50';
  return <div className="w-full border-t border-brand-950/10 pt-3 print:hidden">
    <p className="mb-2 text-brand-950/60 text-xs">Enviar a la Estación de Impresión</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => send('NOTE')}>{noteOnly ? 'Reimprimir nota de entrega' : 'Nota de entrega · estación'}</button>
      {!noteOnly && <button type="button" className={button} disabled={busy || !!fiscal} onClick={() => setOpen(true)}>Factura fiscal · estación</button>}
    </div>
    {message && <p role="status" className="mt-2 text-base">{message}</p>}
    {jobs[0]?.kind === 'NOTE' && <p className="mt-2 text-brand-950/60 text-xs">{jobs[0].status === 'SENT' ? 'Nota enviada a impresión. Comprueba la salida del papel.' : jobs[0].status === 'UNKNOWN' ? 'No se confirmó la nota. Revisa la estación.' : 'Nota pendiente en la estación.'}</p>}
    {!noteOnly && fiscal && <p className="mt-2 text-base" role="status">{fiscal.status === 'PRINTED' ? `Factura fiscal emitida: ${fiscal.result?.numeroFactura}`
      : fiscal.status === 'WAITING' ? 'Factura esperando a la estación.'
      : fiscal.status === 'UNKNOWN' || (fiscal.claimedAt && Date.now() - Date.parse(fiscal.claimedAt) > 120000)
        ? 'Resultado fiscal sin confirmar. Revisa el papel y la estación; no emitas otra factura.' : 'La estación está procesando la factura fiscal…'}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Confirmar factura fiscal</DialogTitle></DialogHeader>
      <p className="text-brand-950/60 text-base">Requiere la app de escritorio y una impresora fiscal configurada. Los precios cobrados se consideran finales, con IVA incluido si seleccionas gravado. Esta opción aplica un mismo tratamiento de IVA a toda la venta.</p>
      <ShopCustomerSearch onSelect={customer => { setName(customer.name); setRif(customer.idNumber ?? ''); }} />
      <label className="block text-sm font-medium">Nombre o razón social<input className="mt-1 w-full rounded-lg border p-2 text-base" value={name} maxLength={60} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm font-medium">Cédula / RIF<input className="mt-1 w-full rounded-lg border p-2 text-base" value={rif} maxLength={20} onChange={e => setRif(e.target.value)} placeholder="V-12345678" /></label>
      <label className="block text-sm font-medium">Tratamiento de IVA<select className="mt-1 w-full rounded-lg border p-2 text-base" value={tax} onChange={e => setTax(e.target.value)}><option value="">Selecciona y confirma</option><option value="general">Gravado · IVA 16% incluido</option><option value="exenta">Exento</option></select></label>
      <label className="block text-sm font-medium">Medio de pago en la impresora<select className="mt-1 w-full rounded-lg border p-2 text-base" value={medio} onChange={e => setMedio(e.target.value)}><option value="">Selecciona el medio utilizado</option>{[['efectivo','Efectivo Bs'],['debito','Débito'],['credito','Crédito'],['cheque','Cheque']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <p className="text-brand-950/60 text-xs">Verifica las tasas y medios configurados en tu impresora. Por ahora no admite tasas mixtas, pagos combinados ni divisas con IGTF.</p>
      {message && <p role="alert" className="text-red-600 text-base">{message}</p>}
      <button type="button" className={button} disabled={busy || !name.trim() || !rif.trim() || !tax || !medio} onClick={() => send('FISCAL')}>{busy ? 'Enviando…' : 'Confirmar y emitir una sola factura'}</button>
    </DialogContent></Dialog>
  </div>;
}

import { useCallback, useEffect, useState } from 'react';
import { masterApi } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Preview = { name: string; fingerprint: string; counts: Record<string, number> };
type Reset = { id: string; actorName: string; reason: string; createdAt: string };
export function RestaurantReset({ id, onReset }: { id: string; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [reports, setReports] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [requestId, setRequestId] = useState('');
  const [history, setHistory] = useState<Reset[]>([]);
  const loadHistory = useCallback(() => masterApi.get(`/master/restaurants/${id}/resets`).then(r => setHistory(r.data.data)).catch(() => setError('No se pudo cargar el historial de reinicios.')), [id]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);
  async function review() {
    setOpen(true); setBusy(true); setError(''); setPreview(null); setName(''); setReports(false); setRequestId(crypto.randomUUID());
    try { setPreview((await masterApi.get(`/master/restaurants/${id}/reset-preview`)).data.data); }
    catch (e: any) { setError(e.response?.data?.error || 'No se pudo revisar el restaurante.'); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!preview || busy || name !== preview.name || !reports || reason.trim().length < 5) return;
    setBusy(true); setError('');
    try {
      await masterApi.post(`/master/restaurants/${id}/reset`, { requestId, confirmationName: name, reason, fingerprint: preview.fingerprint, preserveInventory: true, confirmWeeklyReports: true });
      setOpen(false); setResult('Movimientos reiniciados. Inventario y configuración conservados; respaldo guardado.');
      void loadHistory(); onReset();
    } catch (e: any) { setError(e.response?.data?.error || 'No se pudo confirmar el reinicio. Puedes reintentar; no se repetirá si ya finalizó.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-brand-950">Reiniciar movimientos de prueba</h3><p className="mt-1 max-w-2xl text-brand-950/60 text-base">Conserva existencias, catálogo, recetas, clientes, equipo, configuración y membresía. Solo afecta este local, no sus otras sedes.</p></div><button type="button" onClick={review} className="min-h-[44px] rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800">Reiniciar restaurante</button></div>
    {result && <p role="status" className="mt-3 text-emerald-700 text-base">{result}</p>}
    {!open && error && <p role="alert" className="mt-3 text-red-600 text-base">{error}</p>}
    {history.length > 0 && <div className="mt-4 space-y-2 border-t border-amber-200 pt-3"><p className="font-semibold uppercase text-brand-950/50 text-xs">Últimos reinicios</p>{history.map(item => <p key={item.id} className="text-brand-950/70 text-xs">{new Date(item.createdAt).toLocaleString('es-VE')} · {item.actorName} · {item.reason}</p>)}</div>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Reiniciar movimientos de prueba</DialogTitle></DialogHeader>
      <p className="text-brand-950/70 text-base">Esta acción elimina pedidos, cobros, devoluciones, gastos, compras, nómina, caja, mermas, asientos y reportes semanales guardados. Los saldos bancarios quedan en cero. No revierte ni descuenta inventario.</p>
      <p className="text-brand-950/60 text-base">Se guarda un respaldo para recuperación asistida. Los registros fiscales bloquean el reinicio; la auditoría previa, reservas e historial de inventario se conservan. Realízalo con el local sin operar y los equipos de caja/cocina cerrados.</p>
      {busy && !preview && <p role="status">Revisando movimientos…</p>}
      {preview && <><h4 className="font-semibold">{preview.name}</h4><dl className="grid grid-cols-2 gap-2 text-xs">{Object.entries(preview.counts).filter(([, n]) => n > 0).map(([label, count]) => <div key={label}><dt className="text-brand-950/60">{label}</dt><dd className="font-semibold">{count}</dd></div>)}</dl>
        <label className="block text-sm font-medium">Escribe «{preview.name}»<input disabled={busy} value={name} onChange={e => setName(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-xl border border-brand-950/15 px-3 text-base" /></label>
        <label className="block text-sm font-medium">Motivo del reinicio<textarea disabled={busy} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-brand-950/15 p-3 text-base" placeholder="Ej.: cierre de pruebas antes de comenzar operaciones" /></label>
        <label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" disabled={busy} checked={reports} onChange={e => setReports(e.target.checked)} className="mt-1" />Confirmo eliminar también los reportes semanales de prueba y conservar las cantidades actuales del inventario.</label>
      </>}
      {error && <p role="alert" className="text-red-600 text-base">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button disabled={busy} onClick={() => setOpen(false)} className="min-h-[44px] rounded-xl border px-4">Cancelar</button><button disabled={busy} onClick={review} className="min-h-[44px] rounded-xl border px-4">Revisar de nuevo</button><button disabled={busy || !preview || name !== preview.name || reason.trim().length < 5 || !reports} onClick={reset} className="min-h-[44px] rounded-xl bg-red-600 px-4 font-semibold text-white disabled:opacity-40">{busy ? 'Procesando…' : 'Confirmar reinicio'}</button></div>
    </DialogContent></Dialog>
  </section>;
}

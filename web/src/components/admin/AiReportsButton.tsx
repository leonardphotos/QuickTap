import { useEffect, useState } from 'react';
import { FileSpreadsheet, Sparkles, X } from 'lucide-react';
import { api, AI_TIMEOUT_MS } from '@/api/client';

/** Entrada única para las cuatro verticales. El servidor aplica el interruptor global y el rol. */
export function AiReportsButton({ sidebar = false }: { sidebar?: boolean }) {
  const [enabled, setEnabled] = useState(false); const [open, setOpen] = useState(false); const [question, setQuestion] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get('/ai-reports/status').then((r) => setEnabled(Boolean(r.data.data?.enabled))).catch(() => setEnabled(false)); }, []);
  async function generate() {
    setBusy(true); setError(null);
    try {
      const res = await api.post('/ai-reports/export', { question, from: from || undefined, to: to || undefined }, { responseType: 'blob', timeout: AI_TIMEOUT_MS });
      const url = URL.createObjectURL(res.data); const link = document.createElement('a'); link.href = url; link.download = 'reporte-ia.xlsx'; link.click(); URL.revokeObjectURL(url); setOpen(false);
    } catch (e: any) {
      const body = e.response?.data;
      if (body instanceof Blob) setError(JSON.parse(await body.text()).error ?? 'No se pudo generar el reporte.');
      else setError(body?.error ?? 'No se pudo generar el reporte.');
    } finally { setBusy(false); }
  }
  if (!enabled) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} className={sidebar ? 'mt-3 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white' : 'fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-950/20 hover:bg-brand-600'} title="Preguntar a mis estadísticas">
      <Sparkles className="h-4 w-4" /> Reporte IA
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/35 p-4 sm:items-center" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><div><h2 className="font-semibold text-brand-950">Reporte con IA</h2><p className="mt-1 text-xs text-brand-950/55">Describe lo que necesitas. Tus datos no se envían a Gemini.</p></div><button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder="Ej.: ventas y productos más vendidos de enero a marzo" className="mt-4 min-h-24 w-full rounded-xl border border-brand-950/15 p-3 text-sm outline-none focus:border-brand-500" />
        <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs text-brand-950/60">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 p-2 text-sm" /></label><label className="text-xs text-brand-950/60">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 p-2 text-sm" /></label></div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <button type="button" disabled={busy || question.trim().length < 3} onClick={generate} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" />{busy ? 'Generando…' : 'Generar Excel'}</button>
      </div>
    </div>}
  </>;
}

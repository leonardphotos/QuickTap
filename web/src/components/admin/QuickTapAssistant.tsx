import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Check, Coins, History, X, ArrowUp, Paperclip, LoaderCircle } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext.shared';
import { paymentMethodLines, PAYMENT_METHOD_LABEL, type PlatformPaymentMethods, type SubscriptionPaymentMethod } from '@/utils/plans';
import './quicktap-assistant.css';
import './quicktap-assistant-chat.css';
import AssistantCreditExamples, { type AssistantTariff } from './AssistantCreditExamples';
import AssistantCapabilities from './AssistantCapabilities';

type Action = { components?: {productId:string;variantId:string|null;quantity:number;isChoice:boolean}[]; minSelections?:number|null; maxSelections?:number|null; kind: string; productId?: string; name?: string; description?: string; price?: number; day?: number; closed?: boolean; open?: string; close?: string; parts?: { name: string; groups: { name: string; min: number; max: number; options: { name: string; price: number; maxQuantity: number }[] }[] }[] };
type Task = { id: string; digest: string; credits: number; status: string; expiresAt: string; proposal: { message: string; actions?: Action[]; rows?: { name: string; unit: string; quantity: number; minQuantity: number; unitCost: number }[]; mode?: string }; before: { kitchens?: {id:string;name:string}[]; linkedProducts?: {id:string;kitchenId:string;variants:{id:string;name:string}[]}[]; products?: { id: string; name: string; price: string; description?: string }[]; items?: { name: string; quantity: string }[] } };
type Wallet = { balance: number; enabled: boolean; tariff: AssistantTariff; tasks: { id: string; prompt: string; credits: number; status: string; createdAt: string }[]; topups: { id: string; credits: number; status: string; reviewNote?: string }[] };
type Quote = { id: string; credits: number; amountUsd: string; amountBs: string; exchangeRate: string; paymentDetails: PlatformPaymentMethods; expiresAt: string };
const statusLabel: Record<string, string> = { QUOTED: 'Por confirmar', COMPLETED: 'Completada', FAILED: 'Sin ejecutar', CANCELLED: 'Cancelada', CLARIFICATION: 'Necesita información', PLANNING: 'Preparando', PENDING: 'Pago en revisión', APPROVED: 'Aprobada', REJECTED: 'Rechazada' };
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
function errorText(e: unknown) { return (e as { response?: { data?: { error?: string } } }).response?.data?.error || 'No se pudo completar la solicitud. Comprueba el historial antes de reintentar.'; }

export default function QuickTapAssistant() {
  const { user, restaurant } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sentPrompt, setSentPrompt] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  useEffect(() => setPublishConfirmed(false), [task?.id, task?.digest]);
  const [mode, setMode] = useState('INITIAL');
  const [file, setFile] = useState<File | null>(null);
  const [recharge, setRecharge] = useState(false);
  const [history, setHistory] = useState(false);
  const [credits, setCredits] = useState(150);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('PAGO_MOVIL');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const allowed = !!user && ['OWNER', 'ADMIN'].includes(user.role) && restaurant?.businessType === 'RESTAURANT';
  async function reload() { const { data } = await api.get('/assistant'); setWallet(data.data); }
  useEffect(() => { if (allowed) void reload().catch(e => setError(errorText(e))); }, [allowed]);
  async function run(fn: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  const canSend = !busy && !!wallet?.enabled && wallet.balance > 0 && prompt.trim().length >= 3;
  async function sendRequest() {
    if (!canSend) return;
    const message = prompt.trim();
    await run(async () => {
      if (task?.status === 'QUOTED') await api.post(`/assistant/tasks/${task.id}/cancel`);
      setTask(null);
      setSentPrompt(message);
      const { data } = await api.post('/assistant/proposals', { prompt: message });
      setTask(data.data);
      setPrompt('');
      await reload();
    });
  }
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
    }
  }, [prompt]);
  useEffect(() => {
    if (task) responseRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [task]);
  const currency = restaurant?.currencySymbol ?? '$';
  if (!allowed) return <p>El asistente está disponible para dueños y administradores de restaurantes.</p>;
  return <div className="qt-assistant qa-chat">
    <header className="qa-heading"><span className="qa-brand"><Sparkles size={20} /> QuickTap Asistente</span><div className="qa-tools"><button className="qa-history-toggle" aria-label="Ver historial" aria-expanded={history} onClick={() => { setHistory(!history); setRecharge(false); }}><History size={18} /><span>Historial</span></button><button className="qa-balance" aria-expanded={recharge} onClick={() => { setRecharge(!recharge); setHistory(false); }}><Coins size={17} /><strong>{wallet?.balance ?? '—'}</strong> créditos</button></div></header>
    {history && <section className="qa-card qa-history"><div className="qa-panel-title"><h3>Historial de tareas y recargas</h3><button aria-label="Cerrar historial" onClick={() => setHistory(false)}><X size={20} /></button></div>{!wallet?.tasks?.length && !wallet?.topups?.length && <p>Tus tareas y recargas aparecerán aquí.</p>}{wallet?.tasks?.map(t => <div key={t.id}><p>{t.prompt} · {statusLabel[t.status] ?? t.status} · {t.credits} créditos {t.status !== 'COMPLETED' && '(sin cobrar)'}</p>{['QUOTED', 'COMPLETED'].includes(t.status) && <button disabled={busy} onClick={() => run(async () => { const { data } = await api.get(`/assistant/tasks/${t.id}`); setTask(data.data); })}>Ver detalle</button>}</div>)}{wallet?.topups?.map(t => <p key={t.id}>Recarga de {t.credits} · {statusLabel[t.status] ?? t.status} {t.reviewNote && `· ${t.reviewNote}`}</p>)}</section>}
    {error && <p role="alert" className="qa-error text-xs">{error}</p>}{notice && <p role="status" className="qa-success text-base">{notice}</p>}
    {wallet && !wallet.enabled && <p className="qa-info text-base">Estamos preparando tu asistente. Las propuestas estarán disponibles cuando se active la conexión.</p>}
    {recharge && <section className="qa-card qa-recharge"><div className="qa-panel-title"><h3>Recargar créditos</h3><button aria-label="Cerrar recargas" onClick={() => setRecharge(false)}><X size={20} /></button></div><p>150 créditos por US$5. La recarga no modifica tu mensualidad.</p><div className="qa-price"><strong>{credits} créditos</strong><span>US${credits / 150 * 5}</span></div><input aria-label="Créditos a recargar" type="range" min={150} max={1500} step={150} value={credits} onChange={e => { setCredits(Number(e.target.value)); setQuote(null); }} /><div className="qa-chips">{[150, 300, 600, 1500].map(n => <button key={n} aria-pressed={credits === n} onClick={() => { setCredits(n); setQuote(null); }}>{n}</button>)}</div>
      {wallet?.tariff && <AssistantCreditExamples credits={credits} tariff={wallet.tariff} onIncrease={() => { setCredits(Math.min(1500, credits + 150)); setQuote(null); }} />}
      {!quote ? <button className="qa-primary" disabled={busy || !wallet?.enabled} onClick={() => run(async () => { const { data } = await api.post('/assistant/topups/quote', { credits }); setQuote(data.data); const methods = data.data.paymentDetails; setMethod(methods.pagoMovil ? 'PAGO_MOVIL' : methods.binance ? 'BINANCE' : 'BANK_TRANSFER'); })}>Ver métodos de pago</button> : <div className="qa-stack"><p><strong>US${quote.amountUsd} · Bs {quote.amountBs}</strong><br />Tasa USD: Bs {quote.exchangeRate}. Cotización válida hasta {new Date(quote.expiresAt).toLocaleTimeString()}.</p><label>Método de pago<select value={method} onChange={e => setMethod(e.target.value as SubscriptionPaymentMethod)}>{(['PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER'] as const).filter(m => { const key = { PAGO_MOVIL: 'pagoMovil', BINANCE: 'binance', BANK_TRANSFER: 'bankTransfer' }[m] as keyof PlatformPaymentMethods; return !!quote.paymentDetails[key]; }).map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</select></label><div className="qa-info">{paymentMethodLines(method, quote.paymentDetails).map(l => <p key={l.label}>{l.label}: <strong>{l.value}</strong></p>)}</div><label>Referencia<input value={reference} maxLength={100} onChange={e => setReference(e.target.value)} /></label><label>Fecha del pago<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Comprobante · cámara o galería<input type="file" accept="image/*" onChange={e => setProof(e.target.files?.[0] ?? null)} /></label><button className="qa-primary" disabled={busy || !proof || !reference || !date} onClick={() => run(async () => { const form = new FormData(); form.append('photo', proof!); form.append('quoteId', quote.id); form.append('credits', String(quote.credits)); form.append('method', method); form.append('reference', reference); form.append('date', date); await api.post('/assistant/topups', form, {timeout:30000}); setQuote(null); setRecharge(false); setNotice('Comprobante recibido. Los créditos se agregarán cuando QuickTap apruebe el pago.'); await reload(); })}>Enviar comprobante para revisión</button></div>}
    </section>}
    <div className="qa-conversation" ref={responseRef}>
    <AssistantCapabilities busy={busy} onSelect={text => { setPrompt(text); inputRef.current?.focus(); }} onUpload={() => setUploadOpen(true)} />
    {!task && !sentPrompt && <div className="qa-welcome"><span className="qa-welcome-icon"><Sparkles size={30} strokeWidth={1.5} /></span><h1>Un poco menos de trabajo.<br />Un poco más de tiempo.</h1><p>¿Qué hacemos hoy por tu restaurante?</p></div>}
    {sentPrompt && <div className="qa-user-message"><span className="qa-sr-only">Tu solicitud:</span>{sentPrompt}</div>}
    {busy && !task && <p className="qa-thinking text-base" role="status"><LoaderCircle size={16} /> Preparando tu propuesta…</p>}

    {task && <section className="qa-card qa-proposal" aria-label="Propuesta del asistente"><h3>{task.status === 'COMPLETED' ? 'Tarea completada' : 'Esto es lo que voy a hacer'}</h3><p>{task.proposal.message}</p>
      {task.proposal.actions?.map((a, i) => { const old = task.before.products?.find(p => p.id === a.productId); return <div className="qa-change" key={i}>{a.kind === 'PRODUCT_UPDATE' ? <><strong>{old?.name}</strong>{a.name !== undefined && <p>Nombre: {old?.name} → {a.name}</p>}{a.price !== undefined && <p>Precio: {currency}{old?.price} → {currency}{a.price}</p>}{a.description !== undefined && <><p>Descripción anterior: {old?.description || 'Sin descripción'}</p><p>Nueva descripción: {a.description}</p></>}</> : a.kind === 'SCHEDULE' ? <p><strong>{days[a.day!]}:</strong> {a.closed ? 'Cerrado' : `${a.open}–${a.close}`}</p> : <><strong>{a.name} · {currency}{a.price}</strong><p>{a.description}</p>{a.kind === 'COMBO_LINK' ? <><p>Combo vinculado a platos, cocinas e inventario. {a.minSelections != null ? `Elegir de ${a.minSelections} a ${a.maxSelections} platos; los acompañantes son fijos.` : 'Cantidades fijas.'}</p><ul>{a.components?.map((c, index) => { const product = task.before.linkedProducts?.find(p => p.id === c.productId); return <li key={index}>{c.isChoice ? 'Opción repetible' : `${c.quantity} incluido(s)`}: {task.before.products?.find(p => p.id === c.productId)?.name ?? c.productId}{c.variantId && ` · ${product?.variants.find(v => v.id === c.variantId)?.name ?? 'Tamaño seleccionado'}`} · {task.before.kitchens?.find(k => k.id === product?.kitchenId)?.name ?? 'Cocina asignada'}</li>; })}</ul></> : <p className="qa-hint text-xs">Propuesta antigua: solicita una nueva para vincular inventario.</p>}{a.parts?.map(part => <div key={part.name}><h4>{part.name}</h4>{part.groups.map(g => <div key={g.name}><p>{g.name}: elige de {g.min} a {g.max}</p><ul>{g.options.map(o => <li key={o.name}>{o.name} · {currency}{o.price} · máximo {o.maxQuantity}</li>)}</ul></div>)}</div>)}</>}</div>; })}
      {task.proposal.rows && <div className="qa-table"><table><thead><tr><th>Insumo</th><th>Unidad</th><th>Antes</th><th>{task.proposal.mode === 'ADD' ? 'Sumar' : 'Nueva cantidad'}</th><th>Mínimo</th><th>Costo/u.</th></tr></thead><tbody>{task.proposal.rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.unit}</td><td>{task.before.items?.find(i => i.name.toLowerCase() === row.name.toLowerCase())?.quantity ?? 'Nuevo'}</td><td>{row.quantity}</td><td>{row.minQuantity}</td><td>{currency}{row.unitCost}</td></tr>)}</tbody></table></div>}
      {task.status === 'QUOTED' && <><div className="qa-price"><strong>Costo: {task.credits} créditos</strong><span>Saldo después: {(wallet?.balance ?? 0) - task.credits}</span></div><p className="qa-hint text-xs">Válida hasta {new Date(task.expiresAt).toLocaleTimeString()}. Solo se cobrará si todos los cambios se guardan.</p><label className="qa-hint qa-publish-consent text-sm font-medium"><input type="checkbox" checked={publishConfirmed} onChange={e => setPublishConfirmed(e.target.checked)} /> He revisado los cambios y el costo. Confirmo que quiero aplicarlos y publicarlos cuando corresponda.</label><div className="qa-actions"><button className="qa-primary" disabled={!publishConfirmed || busy || !wallet || wallet.balance < task.credits || Date.now() > Date.parse(task.expiresAt)} onClick={() => run(async () => { const { data } = await api.post(`/assistant/tasks/${task.id}/confirm`, { credits: task.credits, digest: task.digest, publishConfirmed: true }); setTask(data.data); await reload(); setNotice('Cambios aplicados. El consumo quedó registrado en tu historial.'); })}><Check size={16} /> Aplicar cambios · {task.credits} créditos</button><button disabled={busy} onClick={() => run(async () => { await api.post(`/assistant/tasks/${task.id}/cancel`); setTask(null); await reload(); })}>Cancelar</button></div></>}
    </section>}
    </div>
    {uploadOpen && <section id="qa-upload-panel" className="qa-card qa-upload"><div className="qa-panel-title"><h3><Upload size={18} /> Importar inventario</h3><button aria-label="Cerrar importación" onClick={() => setUploadOpen(false)}><X size={18} /></button></div><p>Una hoja, hasta 200 insumos. Columnas: Nombre, Unidad, Cantidad, Cantidad mínima y Costo unitario. Unidades: kg, lt, ml o unidad. Costos en {restaurant?.baseCurrency}; usa valores sin fórmulas.</p><button disabled={busy} onClick={() => run(async () => { const { data } = await api.get('/assistant/inventory-template', { responseType: 'blob' }); const url = URL.createObjectURL(data); const link = document.createElement('a'); link.href = url; link.download = 'inventario-asistente.xlsx'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })}>Descargar plantilla Excel</button><label>Tipo de carga<select value={mode} onChange={e => setMode(e.target.value)}><option value="INITIAL">Existencias iniciales · solo insumos nuevos</option><option value="ADD">Compra · sumar cantidades</option><option value="COUNT">Conteo físico · reemplazar cantidades</option></select></label><input aria-label="Archivo Excel de inventario" type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} /><button className="qa-primary" disabled={busy || !file || !wallet || wallet.balance <= 0} onClick={() => run(async () => { if (task?.status === 'QUOTED') await api.post(`/assistant/tasks/${task.id}/cancel`); setTask(null); const form = new FormData(); form.append('file', file!); form.append('mode', mode); const { data } = await api.post('/assistant/inventory', form); setTask(data.data); await reload(); })}>Revisar Excel y ver costo</button></section>}
    <footer className={`qa-composer-dock${task?.status === 'QUOTED' ? ' qa-reviewing' : ''}`}>
      <form className="qa-chat-input" onSubmit={e => { e.preventDefault(); void sendRequest(); }}>
        <label className="qa-sr-only text-sm font-medium" htmlFor="qa-message">Tu solicitud</label>
        <textarea id="qa-message" ref={inputRef} rows={1} maxLength={4000} placeholder="Pídele algo a tu asistente…" value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void sendRequest(); }
        }} />
        <div className="qa-input-actions"><button type="button" className="qa-attach" aria-label="Adjuntar Excel de inventario" aria-expanded={uploadOpen} aria-controls="qa-upload-panel" title="Importar inventario desde Excel" onClick={() => setUploadOpen(!uploadOpen)}><Paperclip size={20} /></button><span>QuickTap Asistente</span><button type="submit" className="qa-send" disabled={!canSend} aria-label="Enviar solicitud" title="Enviar solicitud">{busy ? <LoaderCircle size={20} className="qa-spinner" /> : <ArrowUp size={22} strokeWidth={2.2} />}</button></div>
      </form>
      <p className="qa-composer-note text-xs">Primero te mostraré los cambios y su costo. Tú decides si continuar.</p>
    </footer>

  </div>;
}

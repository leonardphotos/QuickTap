import { useEffect, useState } from 'react';
import { masterApi } from '@/api/client';
import AssistantEconomics from './AssistantEconomics';
import { useMasterAuth } from '@/context/MasterAuthContext.shared';

type Control = {
  provider: { rates: { inputPerMillion: number; outputPerMillion: number }; enabled: boolean; keyConfigured: boolean; model: string; monthlyLimitMicros: number; referenceBalanceMicros: number; balanceUpdatedAt: string | null; spentMicros: number; heldMicros: number; availableMicros: number; unresolvedCalls: number; economics?: { chargedCredits: number; settledCostMicros: number }; tokens: { _count: number; _sum: { inputTokens: number | null; outputTokens: number | null } } };
  restaurants: { id: string; name: string; assistantWallet: { balance: number } | null }[];
  entries: { id: string; restaurant: { name: string }; delta: number; userId: string; reason: string; createdAt: string }[];
};
const usd = (micros: number) => `US$${(micros / 1e6).toFixed(4)}`;
export default function MasterAssistantControl() {
  const { admin } = useMasterAuth();
  const canEdit = admin?.role === 'ADMIN' || admin?.role === 'FINANCE';
  const [data, setData] = useState<Control | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [balance, setBalance] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [credits, setCredits] = useState(150);
  const [method, setMethod] = useState('PAGO_MOVIL');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [received, setReceived] = useState(false);
  async function load() { const { data: response } = await masterApi.get('/master/assistant/control'); setData(response.data); setEnabled(response.data.provider.enabled); }
  useEffect(() => { void load().catch(() => setError('No se pudo consultar el control del asistente.')); }, []);
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await work(); await load(); } catch (e) { setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || 'No se pudo guardar.'); } finally { setBusy(false); } }
  return <>
    {error && <p role="alert" className="qa-error text-xs">{error}</p>}{message && <p role="status" className="qa-success text-base">{message}</p>}
    <section className="qa-card"><h2 className="text-xl font-semibold">Saldo y consumo de Gemini</h2><p>Los créditos QuickTap son unidades comerciales. Gemini factura tokens en dólares; no existe una equivalencia fija entre ambos.</p>
      {data && <><div className="grid gap-3 sm:grid-cols-3"><div className="qa-info">Saldo disponible para nuevas solicitudes<strong className="block">{usd(data.provider.availableMicros)}</strong><small>Saldo estimado menos reservas. No se renueva cada mes.</small></div><div className="qa-info">Saldo estimado de Gemini<strong className="block">{usd(data.provider.referenceBalanceMicros)}</strong><small>Actualizado manualmente; se descuenta el consumo de QuickTap.</small></div><div className="qa-info">Tokens del mes<strong className="block">{(data.provider.tokens._sum.inputTokens ?? 0).toLocaleString()} entrada · {(data.provider.tokens._sum.outputTokens ?? 0).toLocaleString()} salida</strong><small>{data.provider.tokens._count} solicitudes</small></div></div>
        <p>Modelo: {data.provider.model}. Conexión: {data.provider.keyConfigured ? 'Clave configurada' : 'Falta configurar la clave en el servidor'}. Control: {data.provider.enabled ? 'Habilitado; sujeto a presupuesto' : 'Pausado'}.</p>
        <p className="qa-hint text-xs">Tarifa de referencia: US${data.provider.rates.inputPerMillion} por millón de tokens de entrada y US${data.provider.rates.outputPerMillion} de salida. Solo cuenta este asistente; otros proyectos, claves, imágenes, impuestos o cargos de Google quedan fuera. Saldo registrado: {data.provider.balanceUpdatedAt ? new Date(data.provider.balanceUpdatedAt).toLocaleString() : 'Nunca'}.</p>
        {data.provider.unresolvedCalls > 0 && <p className="qa-info text-base">{data.provider.unresolvedCalls} solicitudes pendientes o de consumo incierto: {usd(data.provider.heldMicros)} retenidos por seguridad. No se liberan automáticamente si falla la conexión.</p>}
        <p className="qa-hint text-xs">Consumo estimado del mes (incluidas reservas): {usd(data.provider.spentMicros)}.</p>
      </>}
      <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer" className="text-brand-500 underline">Consultar consumo y saldo oficial en Google AI Studio</a>
      {canEdit && <form className="qa-stack" onSubmit={e => { e.preventDefault(); void run(async () => { await masterApi.put('/master/assistant/budget', { enabled, ...(balance.trim() ? { referenceBalanceUsd: Number(balance) } : {}) }); setBalance(''); setMessage('Control guardado. No se otorgaron créditos a restaurantes.'); }); }}>
        <label>Actualizar saldo de referencia de Google (opcional, USD)<input type="number" min="0" max="1000" step="0.01" placeholder="Déjalo vacío para conservar el registro" value={balance} onChange={e => setBalance(e.target.value)} /></label>
        <p className="qa-hint text-xs">Copia el saldo desde AI Studio. A partir de aquí se resta el consumo estimado; no se consulta automáticamente a Google. El saldo es dinero disponible, no un presupuesto mensual: si no alcanza para reservar la siguiente solicitud, se bloquea. No hay un tope mensual separado.</p>
        <label><span><input style={{ width: 'auto' }} type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Habilitar solicitudes dentro del presupuesto</span></label><button className="qa-primary" disabled={busy || !data}>Guardar control</button>
      </form>}
    </section>
    {data && <AssistantEconomics availableMicros={data.provider.availableMicros} economics={data.provider.economics} unresolvedCalls={data.provider.unresolvedCalls} rates={data.provider.rates} />}
    {canEdit && <section className="qa-card"><h2 className="text-xl font-semibold">Acreditar una compra desde el máster</h2><p>Sin créditos de regalo. Registra únicamente un pago recibido: 150 créditos por US$5.</p><form className="qa-stack" onSubmit={e => { e.preventDefault(); void run(async () => { await masterApi.post('/master/assistant/credits', { restaurantId, credits, amountUsd: credits / 150 * 5, method, date, reference, note, received }); setReference(''); setNote(''); setReceived(false); setMessage('Compra registrada. Si el pago ya estaba aplicado, no se acreditó de nuevo.'); }); }}>
      <label>Restaurante<select required value={restaurantId} onChange={e => { setRestaurantId(e.target.value); setReceived(false); }}><option value="">Selecciona un restaurante</option>{data?.restaurants.map(r => <option key={r.id} value={r.id}>{r.name} · saldo {r.assistantWallet?.balance ?? 0}</option>)}</select></label>
      <label>Créditos comprados<select value={credits} onChange={e => { setCredits(Number(e.target.value)); setReceived(false); }}>{Array.from({ length: 10 }, (_, i) => (i + 1) * 150).map(n => <option key={n} value={n}>{n} créditos · US${n / 150 * 5}</option>)}</select></label>
      <label>Método<select value={method} onChange={e => setMethod(e.target.value)}><option value="PAGO_MOVIL">Pago Móvil</option><option value="BANK_TRANSFER">Transferencia</option><option value="BINANCE">Binance</option></select></label>
      <label>Fecha del pago<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Referencia<input minLength={4} maxLength={100} required value={reference} onChange={e => setReference(e.target.value)} /></label><label>Observación de verificación<textarea minLength={5} maxLength={500} required value={note} onChange={e => setNote(e.target.value)} /></label>
      <label><span><input type="checkbox" style={{ width: 'auto' }} checked={received} onChange={e => setReceived(e.target.checked)} required /> Confirmo que recibí US${credits / 150 * 5} o su equivalente, y que este pago no se usó para mensualidades ni otras compras.</span></label><button className="qa-primary" disabled={busy || !received || !restaurantId}>Acreditar {credits} créditos comprados</button>
    </form></section>}
    <details className="qa-card"><summary>Últimas acreditaciones</summary>{!data?.entries.length && <p>Todavía no se han acreditado compras.</p>}{data?.entries.map(entry => <div className="qa-change" key={entry.id}><strong>{entry.restaurant.name} · +{entry.delta} créditos</strong><p>{new Date(entry.createdAt).toLocaleString()} · Operador: {entry.userId}</p><p className="qa-hint text-xs">{entry.reason}</p></div>)}</details>
  </>;
}

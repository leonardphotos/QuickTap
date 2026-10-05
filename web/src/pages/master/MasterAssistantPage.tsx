import PaymentProofReview from '@/components/PaymentProofReview';
import { useEffect, useState } from 'react';
import { masterApi } from '@/api/client';
import { PAYMENT_METHOD_LABEL, type SubscriptionPaymentMethod } from '@/utils/plans';
import '@/components/admin/quicktap-assistant.css';
import MasterAssistantControl from './MasterAssistantControl';

type Topup = { proofHash?:string; id: string; restaurant: { name: string }; credits: number; amountUsd: string; amountBs: string; reference: string; paymentDate: string; method: SubscriptionPaymentMethod; status: string; reviewNote?: string };
export default function MasterAssistantPage() {
  const [rows, setRows] = useState<Topup[]>([]);
  const [selected, setSelected] = useState<Topup | null>(null);
  const [note, setNote] = useState('');
  const [proof, setProof] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  async function load() { const { data } = await masterApi.get('/master/assistant/topups'); setRows(data.data); }
  useEffect(() => { void load().catch(() => setError('No se pudieron consultar las recargas.')); }, []);
  useEffect(() => () => { if (proof) URL.revokeObjectURL(proof); }, [proof]);
  async function inspect(row: Topup) { setBusy(true); setError(''); setProof(''); setNote(''); setChecked(false); setSelected(row); try { const { data } = await masterApi.get(`/master/assistant/topups/${row.id}/proof`, { responseType: 'blob' }); setProof(URL.createObjectURL(data)); } catch { setError('No se pudo abrir el comprobante.'); } finally { setBusy(false); } }
  async function review(approve: boolean) { if (!selected || busy) return; setBusy(true); setError(''); try { await masterApi.post(`/master/assistant/topups/${selected.id}/review`, { approve, note }); setSelected(null); setProof(''); await load(); } catch (e) { setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || 'No se pudo revisar.'); } finally { setBusy(false); } }
  return <div className="qt-assistant"><h1 className="text-2xl font-semibold">QuickTap Asistente · Control</h1><MasterAssistantControl /><h2 className="text-xl font-semibold">Comprobantes de recarga</h2><p>Verifica el ingreso bancario, el monto y que no se haya usado este pago para una mensualidad u otra recarga.</p>{error && <p role="alert" className="qa-error text-xs">{error}</p>}<div className="qa-card">{!rows.length && <p>No hay recargas presentadas.</p>}{rows.map(r => <div className="qa-change" key={r.id}><strong>{r.restaurant.name}</strong><p>{r.credits} créditos · US${r.amountUsd} · {r.status === 'PENDING' ? 'Pendiente' : r.status === 'APPROVED' ? 'Aprobada' : 'Rechazada'}</p><button className="qa-primary" disabled={busy} onClick={() => inspect(r)}>Revisar comprobante</button></div>)}</div>{selected && <section className="qa-card"><h2>{selected.restaurant.name} · {selected.credits} créditos</h2><p>US${selected.amountUsd} / Bs {selected.amountBs}</p><p>{PAYMENT_METHOD_LABEL[selected.method]} · {selected.reference} · {selected.paymentDate}</p>{proof && <img src={proof} alt="Comprobante de recarga" style={{ maxHeight: 420, maxWidth: '100%', objectFit: 'contain' }} />}{selected.proofHash&&<PaymentProofReview fileKey={`/assistant-topups/${selected.id}/${selected.proofHash}`} master/>}{selected.status === 'PENDING' && <><label className="qa-stack text-sm font-medium">Observación de revisión<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} /></label><label><span><input type="checkbox" style={{ width: 'auto' }} checked={checked} onChange={e => setChecked(e.target.checked)} /> Verifiqué que el pago fue recibido y no está acreditado en otra operación.</span></label><div className="qa-actions"><button className="qa-primary" disabled={busy || !proof || !checked || note.trim().length < 5} onClick={() => review(true)}>Aprobar y acreditar {selected.credits} créditos</button><button disabled={busy || note.trim().length < 5} onClick={() => review(false)}>Rechazar</button></div></>}<button onClick={() => { setSelected(null); setProof(''); }} disabled={busy}>Cerrar</button></section>}</div>;
}

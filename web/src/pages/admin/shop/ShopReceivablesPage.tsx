import { useEffect, useState } from 'react';
import { AlertTriangle, Landmark, Send } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { sendWhatsappOrOpen } from '@/utils/sendWhatsapp';
import { TextureButton } from '@/components/ui/texture-button';
import { ShopInstallmentsDialog } from './ShopInstallmentsDialog';
import { TextureCard } from '@/components/ui/texture-card';
import { Toast } from '@/components/ui/toast';
import { shopMoneyFormatters } from './shopFormat';

interface ReceivableSale {
  id: string;
  total: number;
  time: string;
  customerName: string | null;
  customerPhone: string | null;
  creditTerms: 'FULL' | 'INSTALLMENT';
  dueDate: string | null;
  settledAt: string | null;
  paid: number;
  balance: number;
}

function daysUntil(dueDate: string): number {
  const ms = new Date(`${dueDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

/** Insignia de vencimiento — vencida (rojo), vence hoy/mañana (ámbar), o la fecha normal. */
function DueBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <span className="text-xs text-brand-950/35">Sin fecha</span>;
  const days = daysUntil(dueDate);
  const label = new Date(`${dueDate}T00:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
  if (days < 0) {
    return <span className="text-xs font-semibold text-red-600">Vencida · {label}</span>;
  }
  if (days <= 2) {
    return <span className="text-xs font-semibold text-amber-600">{days === 0 ? 'Vence hoy' : `Vence en ${days}d`} · {label}</span>;
  }
  return <span className="text-xs text-brand-950/50">Vence {label}</span>;
}

function reminderMessage(businessName: string, balance: number, money: (n: number) => string, dueDate: string | null): string {
  const parts = [
    `Hola, te escribimos de *${businessName}* — tienes un saldo pendiente de ${money(balance)}.`,
    dueDate ? `Fecha de pago acordada: ${new Date(`${dueDate}T00:00:00`).toLocaleDateString('es-VE')}.` : '',
    'Cualquier duda, con gusto te ayudamos. ¡Gracias!',
  ].filter(Boolean);
  return parts.join('\n\n');
}

function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/**
 * Cuentas por Cobrar (Local Comercial): ventas fiadas (ShopSale.creditTerms) con su saldo
 * pendiente, agrupadas por vencimiento. A diferencia de la venta a crédito de siempre (que solo
 * registraba el "fiado" pero no llevaba seguimiento del pago después), acá se puede abonar contra
 * el saldo y ponerle/editarle fecha de compromiso — sin eso, "fiado" era solo una etiqueta.
 * El recordatorio sale por el chatbot de WhatsApp vinculado (Ajustes → WhatsApp) si está
 * conectado; si no, cae al enlace wa.me de siempre para que el cajero lo mande a mano.
 */
export default function ShopReceivablesPage() {
  const { restaurant } = useAuth();
  const { money } = shopMoneyFormatters(restaurant!);
  const { show, toastMessage } = useToast();

  const [sales, setSales] = useState<ReceivableSale[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  // Venta cuyo plan de cuotas se está viendo o armando.
  const [planDe, setPlanDe] = useState<ReceivableSale | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [dueInput, setDueInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get(showHistory ? '/shop/receivables/history' : '/shop/receivables').then((res) => setSales(res.data.data));
  }

  useEffect(load, [showHistory]);

  const totalPending = sales.filter((s) => !s.settledAt).reduce((a, s) => a + s.balance, 0);
  const overdueCount = sales.filter((s) => !s.settledAt && s.dueDate && daysUntil(s.dueDate) < 0).length;

  async function confirmPayment(saleId: string) {
    const amount = Number(payAmount);
    if (!(amount > 0)) return;
    setError(null);
    try {
      await api.post(`/shop/sales/${saleId}/payments`, { amount, method: payMethod.trim() || undefined });
      setPayingId(null);
      setPayAmount('');
      setPayMethod('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el abono.');
    }
  }

  async function saveDueDate(saleId: string) {
    await api.patch(`/shop/sales/${saleId}/due-date`, { dueDate: dueInput || null });
    setEditingDueId(null);
    load();
  }

  async function sendReminder(s: ReceivableSale) {
    if (!s.customerPhone) return;
    const message = reminderMessage(restaurant?.name ?? '', s.balance, money, s.dueDate);
    const sent = await sendWhatsappOrOpen(s.customerPhone, message, whatsappUrl(s.customerPhone, message));
    if (sent) show('Mensaje enviado');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-brand-950">Cuentas por Cobrar</h1>
          <p className="text-sm text-brand-950/60 font-light">Ventas fiadas con saldo pendiente — abona y avísale al cliente cuando se acerque la fecha.</p>
        </div>
        <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'Ver solo pendientes' : 'Ver historial completo'}
        </TextureButton>
      </div>

      {!showHistory && (
        <div className="grid grid-cols-2 gap-3.5">
          <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-4 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <Landmark className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] text-brand-950/45 font-medium">Total pendiente</p>
              <p className="text-lg font-bold text-brand-950">{money(totalPending)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-4 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] text-brand-950/45 font-medium">Cuentas vencidas</p>
              <p className="text-lg font-bold text-brand-950">{overdueCount}</p>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <TextureCard>
        <ul className="divide-y divide-brand-950/10">
          {sales.map((s) => (
            <li key={s.id} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-brand-950">
                    {s.customerName || 'Cliente sin nombre'}
                    {s.settledAt && (
                      <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Saldada</span>
                    )}
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {new Date(s.time).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {s.creditTerms === 'FULL' ? 'Todo fiado' : 'Abono inicial + resto fiado'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-brand-950">{money(s.balance)}</p>
                  <p className="text-xs text-brand-950/40">de {money(s.total)}</p>
                </div>
              </div>

              {!s.settledAt && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {editingDueId === s.id ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={dueInput}
                        onChange={(e) => setDueInput(e.target.value)}
                        autoFocus
                        className="text-xs border border-brand-950/15 rounded-lg px-2 py-1"
                      />
                      <button onClick={() => saveDueDate(s.id)} className="text-xs font-medium text-brand-500 hover:text-brand-600">
                        Guardar
                      </button>
                      <button onClick={() => setEditingDueId(null)} className="text-xs text-brand-950/40 hover:text-brand-950">
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingDueId(s.id);
                        setDueInput(s.dueDate ?? '');
                      }}
                    >
                      <DueBadge dueDate={s.dueDate} />
                    </button>
                  )}
                </div>
              )}

              {!s.settledAt && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {payingId === s.id ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder={`Máx. ${s.balance.toFixed(2)}`}
                        autoFocus
                        className="w-28 text-sm border border-brand-950/15 rounded-lg px-2 py-1"
                      />
                      <input
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        placeholder="Método (opcional)"
                        className="w-32 text-sm border border-brand-950/15 rounded-lg px-2 py-1"
                      />
                      <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => confirmPayment(s.id)}>
                        Registrar
                      </TextureButton>
                      <button onClick={() => setPayingId(null)} className="text-sm text-brand-950/40 hover:text-brand-950">
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setPayingId(s.id);
                        setPayAmount('');
                        setPayMethod('');
                      }}
                      className="text-sm font-medium text-brand-500 hover:text-brand-600"
                    >
                      Registrar abono
                    </button>
                  )}
                  {/* Cuotas: armar el calendario, o revisarlo y corregir montos y fechas. */}
                  <button
                    type="button"
                    onClick={() => setPlanDe(s)}
                    className="text-sm font-medium text-brand-500 hover:text-brand-600"
                  >
                    Cuotas
                  </button>
                  {s.customerPhone && (
                    <button
                      type="button"
                      onClick={() => sendReminder(s)}
                      className="text-sm text-brand-950/50 hover:text-brand-950 flex items-center gap-1"
                    >
                      <Send className="h-3.5 w-3.5" /> Recordar por WhatsApp
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
          {sales.length === 0 && (
            <li className="px-4 py-10 text-center text-brand-950/40 text-sm font-light">
              {showHistory ? 'Todavía no hay ventas fiadas.' : 'Sin saldos pendientes — todo al día.'}
            </li>
          )}
        </ul>
      </TextureCard>

      <Toast message={toastMessage} />
      {planDe && (
        <ShopInstallmentsDialog
          saleId={planDe.id}
          saldo={planDe.balance}
          onClose={() => setPlanDe(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

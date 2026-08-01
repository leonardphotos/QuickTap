import { useEffect, useState } from 'react';
import { FileText, Plus, Send, Trash2, X } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { sendWhatsappOrOpen } from '@/utils/sendWhatsapp';
import { CURRENCY_SYMBOLS } from '@/utils/format';
import type { Quote, QuoteItem } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard } from '@/components/ui/texture-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toast } from '@/components/ui/toast';

function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

function buildQuoteMessage(quote: Quote, businessName: string, symbol: string): string {
  const lines = quote.items.map((i) => `• ${i.qty}x ${i.name} — ${symbol}${(i.qty * i.unitPrice).toFixed(2)}`);
  return [
    `*Presupuesto — ${businessName}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    ...lines,
    '━━━━━━━━━━━━━━━━━━━━',
    `*Total: ${symbol}${Number(quote.totalBase).toFixed(2)}*`,
    quote.note ? `\n${quote.note}` : '',
    '\n_Cotización de QuickTap.club — no es un cobro, es solo referencia._',
  ]
    .filter(Boolean)
    .join('\n');
}

interface DraftItem extends QuoteItem {
  key: number;
}

/**
 * Cotizaciones/presupuestos: un total para que el cliente apruebe (catering, pedido grande,
 * venta al mayor) sin cobrar ni tocar cocina/inventario todavía — compartido tal cual por el
 * panel de restaurante (QuotesPage.tsx) y por Local Comercial (ShopQuotesPage.tsx), porque los
 * ítems son un snapshot libre (nombre/cantidad/precio), no referencias al catálogo de uno u otro.
 * "Convertida" es una marca manual (no hay conversión automática a pedido/venta real — eso
 * implicaría revalidar cada línea contra el catálogo vivo, lo mismo que ya hace el flujo normal).
 */
export function QuoteManager() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const { show, toastMessage } = useToast();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ key: 0, name: '', qty: 1, unitPrice: 0 }]);
  const [nextKey, setNextKey] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertRef, setConvertRef] = useState('');

  function load() {
    api.get('/quotes').then((res) => setQuotes(res.data.data));
  }

  useEffect(load, []);

  function openNew() {
    setCustomerName('');
    setCustomerPhone('');
    setNote('');
    setItems([{ key: 0, name: '', qty: 1, unitPrice: 0 }]);
    setNextKey(1);
    setError(null);
    setOpen(true);
  }

  function updateItem(key: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, { key: nextKey, name: '', qty: 1, unitPrice: 0 }]);
    setNextKey((k) => k + 1);
  }

  function removeItemRow(key: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  const draftTotal = items.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  async function save() {
    const cleanItems = items
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 0, unitPrice: Number(it.unitPrice) || 0 }))
      .filter((it) => it.name && it.qty > 0);
    if (cleanItems.length === 0) {
      setError('Agrega al menos un ítem con nombre y cantidad.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/quotes', {
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        note: note.trim() || undefined,
        items: cleanItems,
      });
      setOpen(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la cotización.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta cotización?')) return;
    await api.delete(`/quotes/${id}`);
    load();
  }

  async function sendQuote(q: Quote) {
    if (!q.customerPhone) return;
    const message = buildQuoteMessage(q, restaurant?.name ?? '', symbol);
    const sent = await sendWhatsappOrOpen(q.customerPhone, message, whatsappUrl(q.customerPhone, message));
    if (sent) show('Mensaje enviado');
  }

  async function confirmConvert(id: string) {
    if (!convertRef.trim()) return;
    await api.patch(`/quotes/${id}/converted`, { convertedToId: convertRef.trim() });
    setConvertingId(null);
    setConvertRef('');
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-950">Cotizaciones</h1>
          <p className="text-sm text-brand-950/60 font-light">
            Arma un presupuesto para que el cliente apruebe — no cobra ni descuenta inventario.
          </p>
        </div>
        <TextureButton variant="brand" size="default" className="!w-auto flex items-center gap-1.5" onClick={openNew}>
          <Plus className="h-4 w-4" /> Nueva cotización
        </TextureButton>
      </div>

      <TextureCard>
        <ul className="divide-y divide-brand-950/10">
          {quotes.map((q) => (
            <li key={q.id} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-brand-950">
                    {q.customerName || 'Sin nombre de cliente'}
                    {q.convertedToId && (
                      <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        Convertida
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-brand-950/50 font-light">
                    {new Date(q.createdAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {q.items.length} ítem{q.items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="text-lg font-semibold text-brand-950 shrink-0">
                  {symbol}
                  {Number(q.totalBase).toFixed(2)}
                </p>
              </div>

              <ul className="mt-2 space-y-0.5">
                {q.items.map((it, i) => (
                  <li key={i} className="text-sm text-brand-950/60 flex justify-between gap-2">
                    <span className="truncate">
                      {it.qty}x {it.name}
                    </span>
                    <span className="shrink-0">
                      {symbol}
                      {(it.qty * it.unitPrice).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              {q.note && <p className="mt-1.5 text-xs text-brand-950/40 italic">{q.note}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {q.customerPhone && (
                  <button
                    type="button"
                    onClick={() => sendQuote(q)}
                    className="text-sm text-brand-500 hover:text-brand-600 flex items-center gap-1"
                  >
                    <Send className="h-3.5 w-3.5" /> Enviar por WhatsApp
                  </button>
                )}
                {!q.convertedToId &&
                  (convertingId === q.id ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={convertRef}
                        onChange={(e) => setConvertRef(e.target.value)}
                        placeholder="Ej: pedido #45"
                        className="text-xs border border-brand-950/15 rounded-lg px-2 py-1 w-32"
                      />
                      <button onClick={() => confirmConvert(q.id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
                        Guardar
                      </button>
                      <button onClick={() => setConvertingId(null)} className="text-brand-950/30 hover:text-brand-950">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setConvertingId(q.id);
                        setConvertRef('');
                      }}
                      className="text-sm text-brand-950/50 hover:text-brand-950"
                    >
                      Marcar como convertida
                    </button>
                  ))}
                {!q.convertedToId && (
                  <button onClick={() => remove(q.id)} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                )}
              </div>
            </li>
          ))}
          {quotes.length === 0 && (
            <li className="px-4 py-10 text-center text-brand-950/40 text-sm font-light flex flex-col items-center gap-2">
              <FileText className="h-6 w-6 text-brand-950/20" />
              Sin cotizaciones todavía.
            </li>
          )}
        </ul>
      </TextureCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva cotización</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Cliente (opcional)"
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="WhatsApp (opcional)"
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.key} className="flex items-center gap-2">
                  <input
                    value={it.name}
                    onChange={(e) => updateItem(it.key, { name: e.target.value })}
                    placeholder="Producto / servicio"
                    className="flex-1 min-w-0 border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    value={it.qty}
                    onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) || 0 })}
                    placeholder="Cant."
                    className="w-16 shrink-0 border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm text-center"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.unitPrice}
                    onChange={(e) => updateItem(it.key, { unitPrice: Number(e.target.value) || 0 })}
                    placeholder="Precio"
                    className="w-24 shrink-0 border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm text-right"
                  />
                  <button
                    type="button"
                    onClick={() => removeItemRow(it.key)}
                    disabled={items.length === 1}
                    className="shrink-0 text-brand-950/30 hover:text-red-500 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addItemRow} className="text-sm font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Agregar ítem
              </button>
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota (opcional) — ej: válido por 7 días"
              rows={2}
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />

            <div className="flex items-center justify-between pt-1 border-t border-brand-950/10">
              <span className="text-sm text-brand-950/60">Total</span>
              <span className="text-lg font-semibold text-brand-950">
                {symbol}
                {draftTotal.toFixed(2)}
              </span>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar cotización'}
            </TextureButton>
          </div>
        </DialogContent>
      </Dialog>

      <Toast message={toastMessage} />
    </div>
  );
}

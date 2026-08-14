import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, FileText, Pencil, Plus, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadElementAsPdf } from '@/utils/pdf';

/**
 * Master → Cotizaciones: presupuestos para FUTUROS clientes. Crear (plan + cargos
 * únicos personalizables) → enviar por WhatsApp (bot de la plataforma, con respaldo
 * wa.me si no está conectado) → aprobar cuando el cliente acepta.
 */

interface QuoteItem {
  label: string;
  amountUsd: number;
}

interface PlatformQuote {
  id: string;
  quoteNumber: number;
  clientName: string;
  clientPhone: string;
  businessName: string | null;
  planName: string;
  planPriceUsd: string;
  planCycle: string;
  items: QuoteItem[];
  totalUsd: string;
  note: string | null;
  status: 'PENDING' | 'SENT' | 'APPROVED';
  sentAt: string | null;
  approvedAt: string | null;
  createdAt: string;
}

/** Los planes reales se cargan de /public/plans — la MISMA fuente que la página de
 * precios, así la cotización nunca ofrece un plan que no existe o con precio viejo. */
interface PublicPlan {
  name: string;
  prices: { MONTHLY: number; QUARTERLY: number; SEMIANNUAL: number };
}

/** Meses y clave de precio de cada ciclo (los precios públicos son por mes con
 * descuento según el ciclo; la cotización muestra el total del ciclo). */
const CYCLES = [
  { label: 'Mensual', priceKey: 'MONTHLY', months: 1 },
  { label: 'Trimestral', priceKey: 'QUARTERLY', months: 3 },
  { label: 'Semestral', priceKey: 'SEMIANNUAL', months: 6 },
] as const;

/** Cargos únicos estándar, para agregarlos con un toque. */
const ITEM_PRESETS: QuoteItem[] = [
  { label: 'Instalación y configuración', amountUsd: 200 },
  { label: 'Carga de inventario', amountUsd: 150 },
  { label: 'Capacitación del equipo', amountUsd: 50 },
];

const money = (n: string | number) => `$${Number(n).toFixed(2)}`;
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '');

export default function MasterQuotesPage() {
  const [tab, setTab] = useState<'open' | 'approved'>('open');
  const [quotes, setQuotes] = useState<PlatformQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<PlatformQuote | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cotización que se está exportando: se monta la plantilla oculta, se captura y se limpia.
  const [pdfQuote, setPdfQuote] = useState<PlatformQuote | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pdfQuote || !pdfRef.current) return;
    const el = pdfRef.current;
    const run = async () => {
      // Esperar a que el logo termine de cargar antes de capturar.
      const imgs = [...el.querySelectorAll('img')];
      await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; }))));
      await downloadElementAsPdf(el, `cotizacion-quicktap-${pdfQuote.quoteNumber}.pdf`);
      setPdfQuote(null);
    };
    run().catch((err) => {
      console.error('[cotizaciones] No se pudo generar el PDF:', err);
      setPdfQuote(null);
    });
  }, [pdfQuote]);

  const load = useCallback(() => {
    setLoading(true);
    masterApi
      .get('/master/quotes', { params: { status: tab } })
      .then((res) => setQuotes(res.data.data))
      .catch(() => setError('No se pudieron cargar las cotizaciones.'))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(load, [load]);

  async function action(id: string, path: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await masterApi.post(`/master/quotes/${id}/${path}`);
      if (path === 'send') {
        const { sent, waLink } = res.data.data;
        // Bot desconectado o número sin WhatsApp: se abre wa.me con el mismo texto
        // para mandarlo a mano desde el teléfono del equipo.
        if (!sent) window.open(waLink, '_blank');
      }
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo completar la acción.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta cotización?')) return;
    setBusyId(id);
    try {
      await masterApi.delete(`/master/quotes/${id}`);
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-brand-950 flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-500" /> Cotizaciones
          </h1>
          <p className="text-sm text-brand-950/50 font-light">Presupuestos para futuros clientes, enviados por WhatsApp.</p>
        </div>
        <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva cotización
        </TextureButton>
      </div>

      <div className="inline-flex items-center gap-1 rounded-full bg-brand-950/[0.05] p-1 mb-5">
        {(
          [
            ['open', 'Cotizaciones'],
            ['approved', 'Aprobadas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === key ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-brand-950/40 font-light">Cargando…</p>
      ) : quotes.length === 0 ? (
        <p className="text-sm text-brand-950/40 font-light">
          {tab === 'approved' ? 'Todavía no hay cotizaciones aprobadas.' : 'Todavía no hay cotizaciones. Crea la primera.'}
        </p>
      ) : (
        <div className="space-y-3">
          {quotes.map((q) => (
            <div key={q.id} className="rounded-2xl border border-brand-950/[0.08] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-950">
                    #{q.quoteNumber} · {q.clientName}
                    {q.businessName && <span className="font-medium text-brand-950/50"> — {q.businessName}</span>}
                  </p>
                  <p className="text-xs text-brand-950/50 font-light mt-0.5">
                    📞 {q.clientPhone} · Plan {q.planName} {money(q.planPriceUsd)} ({q.planCycle.toLowerCase()})
                    {q.items.length > 0 && ` · ${q.items.map((i) => `${i.label} ${money(i.amountUsd)}`).join(' · ')}`}
                  </p>
                  {q.note && <p className="text-xs text-brand-950/40 font-light mt-0.5 italic">{q.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-brand-950">{money(q.totalUsd)}</p>
                  <p className="text-[11px] font-medium">
                    {q.status === 'APPROVED' ? (
                      <span className="text-emerald-600">✓ Aprobada {fecha(q.approvedAt)}</span>
                    ) : q.status === 'SENT' ? (
                      <span className="text-brand-500">Enviada {fecha(q.sentAt)}</span>
                    ) : (
                      <span className="text-amber-600">Por enviar</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {q.status !== 'APPROVED' && (
                  <>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => action(q.id, 'send')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" /> {q.status === 'SENT' ? 'Reenviar' : 'Enviar por WhatsApp'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => action(q.id, 'approve')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Marcar aprobada
                    </button>
                  </>
                )}
                {q.status === 'APPROVED' && (
                  <button
                    type="button"
                    disabled={busyId === q.id}
                    onClick={() => action(q.id, 'unapprove')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-950/15 px-3.5 py-1.5 text-xs font-semibold text-brand-950/70 hover:bg-brand-950/5 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Devolver a enviadas
                  </button>
                )}
                {q.status !== 'APPROVED' && (
                  <button
                    type="button"
                    disabled={busyId === q.id}
                    onClick={() => setEditQuote(q)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-950/15 px-3.5 py-1.5 text-xs font-semibold text-brand-950/70 hover:bg-brand-950/5 disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                )}
                <button
                  type="button"
                  disabled={pdfQuote !== null}
                  onClick={() => setPdfQuote(q)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-950/15 px-3.5 py-1.5 text-xs font-semibold text-brand-950/70 hover:bg-brand-950/5 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> {pdfQuote?.id === q.id ? 'Generando…' : 'PDF'}
                </button>
                <button
                  type="button"
                  disabled={busyId === q.id}
                  onClick={() => remove(q.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && <QuoteFormDialog onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); setTab('open'); load(); }} />}

      {editQuote && (
        <QuoteFormDialog
          quote={editQuote}
          onClose={() => setEditQuote(null)}
          onSaved={() => { setEditQuote(null); load(); }}
        />
      )}

      {/* Plantilla del PDF, montada fuera de pantalla solo mientras se genera. */}
      {pdfQuote && (
        <div className="fixed -left-[9999px] top-0">
          <QuotePdfTemplate ref={pdfRef} quote={pdfQuote} />
        </div>
      )}
    </div>
  );
}

/** Hoja A4 de la cotización con la línea gráfica de QuickTap (logo, azul de marca,
 * Poppins). Se renderiza oculta y se captura con html2canvas → PDF. */
const QuotePdfTemplate = forwardRef<HTMLDivElement, { quote: PlatformQuote }>(function QuotePdfTemplate({ quote }, ref) {
  const half = Number(quote.totalUsd) / 2;
  const fmtFecha = (d: Date) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
  const creada = new Date(quote.createdAt);
  // Vence exactamente un mes después de emitida.
  const vence = new Date(creada);
  vence.setMonth(vence.getMonth() + 1);
  // OJO: solo colores hex/rgba INLINE — html2canvas no entiende los colores oklab
  // que Tailwind v4 genera con los modificadores de opacidad (text-brand-950/50).
  const navy = '#001b43';
  const blue = '#009aff';
  const dim = (a: number) => `rgba(0,27,67,${a})`;
  return (
    <div ref={ref} style={{ width: 794, minHeight: 1000, backgroundColor: '#ffffff', color: navy }} className="flex flex-col font-sans">
      {/* Cabecera: logo + número, con la franja azul de la marca */}
      <div className="px-12 pt-10 pb-6 flex items-start justify-between">
        <div>
          <img src="/logo/logo-central.png" alt="QuickTap" style={{ height: 34, width: 'auto' }} />
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: blue }}>Cotización</p>
          <p className="text-2xl font-bold">N.º {quote.quoteNumber}</p>
          <p className="text-[11px] font-light" style={{ color: dim(0.5) }}>{fmtFecha(creada)}</p>
          <p className="text-[11px] font-light" style={{ color: dim(0.5) }}>
            <span className="font-medium" style={{ color: dim(0.7) }}>Fecha de vencimiento:</span> {fmtFecha(vence)}
          </p>
        </div>
      </div>
      <div style={{ height: 4, backgroundColor: blue }} className="mx-12 rounded-full" />

      {/* Cliente */}
      <div className="px-12 pt-6">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: dim(0.4) }}>Preparada para</p>
        <p className="mt-1 text-lg font-bold">{quote.clientName}</p>
        {quote.businessName && <p className="text-sm font-medium" style={{ color: dim(0.7) }}>{quote.businessName}</p>}
        <p className="text-sm font-light" style={{ color: dim(0.5) }}>{quote.clientPhone}</p>
      </div>

      {/* Detalle */}
      <div className="px-12 pt-7">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: dim(0.4) }}>
              <th className="pb-2">Concepto</th>
              <th className="pb-2 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${dim(0.08)}` }}>
              <td className="py-3">
                <span className="font-semibold">Plan {quote.planName}</span>
                <span className="font-light" style={{ color: dim(0.5) }}> · {quote.planCycle.toLowerCase()}</span>
              </td>
              <td className="py-3 text-right font-semibold">{money(quote.planPriceUsd)}</td>
            </tr>
            {quote.items.map((it, i) => (
              <tr key={`${it.label}-${i}`} style={{ borderTop: `1px solid ${dim(0.08)}` }}>
                <td className="py-3">
                  {it.label} <span className="font-light text-xs" style={{ color: dim(0.4) }}>(pago único)</span>
                </td>
                <td className="py-3 text-right">{money(it.amountUsd)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${navy}` }}>
              <td className="py-3 text-base font-bold">Pago inicial</td>
              <td className="py-3 text-right text-xl font-bold" style={{ color: blue }}>{money(quote.totalUsd)}</td>
            </tr>
          </tbody>
        </table>
        {quote.items.length > 0 && (
          <p className="mt-1 text-xs font-light" style={{ color: dim(0.5) }}>
            Luego del pago inicial, solo el plan: {money(quote.planPriceUsd)} ({quote.planCycle.toLowerCase()}).
          </p>
        )}
      </div>

      {/* Términos 50/50 */}
      <div className="mx-12 mt-7 rounded-2xl px-6 py-5" style={{ backgroundColor: 'rgba(0,154,255,0.07)' }}>
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: blue }}>Condiciones de pago</p>
        <p className="mt-1.5 text-sm">
          <span className="font-semibold">50% para comenzar la instalación ({money(half)})</span>
          <span style={{ color: dim(0.6) }}> · el 50% restante ({money(half)}) a los 15 días.</span>
        </p>
        <p className="mt-1 text-xs font-light" style={{ color: dim(0.5) }}>Incluye 15 días de prueba gratis, sin tarjeta de crédito.</p>
      </div>

      {/* Pie */}
      <div className="mt-auto px-12 pb-10 pt-8">
        <div style={{ height: 1, backgroundColor: dim(0.1) }} className="mb-4" />
        <div className="flex items-center justify-between text-[11px] font-light" style={{ color: dim(0.4) }}>
          <span>QuickTap.club — menú QR, pedidos, delivery e inventario para tu negocio.</span>
          <span>quicktap.club</span>
        </div>
      </div>
    </div>
  );
});

/** Crea una cotización nueva, o edita una existente si se pasa `quote` (precarga
 * todos los campos y guarda con PATCH en vez de POST). Deshabilitada para
 * aprobadas — el backend también lo rechaza, esto solo evita el viaje inútil. */
function QuoteFormDialog({ quote, onClose, onSaved }: { quote?: PlatformQuote; onClose: () => void; onSaved: () => void }) {
  const isEditing = !!quote;
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [clientName, setClientName] = useState(quote?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(quote?.clientPhone ?? '');
  const [businessName, setBusinessName] = useState(quote?.businessName ?? '');
  const [planName, setPlanName] = useState(quote?.planName ?? '');
  const [planPrice, setPlanPrice] = useState(quote?.planPriceUsd ?? '');
  const [planCycle, setPlanCycle] = useState(quote?.planCycle ?? 'Mensual');
  const [items, setItems] = useState<QuoteItem[]>(quote?.items ?? []);
  const [itemLabel, setItemLabel] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [note, setNote] = useState(quote?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    masterApi.get('/public/plans').then((res) => {
      const list = Object.values(res.data.data as Record<string, PublicPlan>);
      setPlans(list);
      // Al crear (no al editar): arranca con el Plan Pro (o el primero), a precio mensual real.
      if (isEditing) return;
      const initial = list.find((p) => p.name.includes('Pro')) ?? list[0];
      if (initial) {
        setPlanName(initial.name);
        setPlanPrice(String(initial.prices.MONTHLY));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsTotal = items.reduce((acc, i) => acc + i.amountUsd, 0);
  const total = (Number(planPrice) || 0) + itemsTotal;

  /** Precio del ciclo completo (los públicos son por mes con descuento por ciclo). */
  function priceFor(plan: PublicPlan, cycleLabel: string): number {
    const cycle = CYCLES.find((c) => c.label === cycleLabel) ?? CYCLES[0];
    return Math.round(plan.prices[cycle.priceKey] * cycle.months * 100) / 100;
  }

  function pickPlan(name: string) {
    setPlanName(name);
    const plan = plans.find((p) => p.name === name);
    if (plan) setPlanPrice(String(priceFor(plan, planCycle)));
  }

  function pickCycle(cycleLabel: string) {
    setPlanCycle(cycleLabel);
    const plan = plans.find((p) => p.name === planName);
    if (plan) setPlanPrice(String(priceFor(plan, cycleLabel)));
  }

  function addItem(item?: QuoteItem) {
    const label = item?.label ?? itemLabel.trim();
    const amountUsd = item?.amountUsd ?? Number(itemAmount);
    if (!label || !(amountUsd >= 0)) return;
    setItems((prev) => [...prev, { label, amountUsd }]);
    setItemLabel('');
    setItemAmount('');
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      businessName: businessName.trim() || null,
      planName: planName.trim(),
      planPriceUsd: Number(planPrice) || 0,
      planCycle,
      items,
      note: note.trim() || null,
    };
    try {
      if (isEditing) {
        await masterApi.patch(`/master/quotes/${quote.id}`, payload);
      } else {
        await masterApi.post('/master/quotes', payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? `No se pudo ${isEditing ? 'guardar' : 'crear'} la cotización.`);
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Editar cotización #${quote.quoteNumber}` : 'Nueva cotización'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-brand-950/70">Nombre del cliente</span>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="María Pérez" className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Teléfono (WhatsApp)</span>
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="0414-1234567" className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-brand-950/70">Negocio (opcional)</span>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Restaurante El Fogón" className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2" />
          </label>

          <div className="border-t border-brand-950/[0.06] pt-3">
            <p className="text-sm font-bold text-brand-950 mb-2">Plan</p>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {plans.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => pickPlan(p.name)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    planName === p.name ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.05] text-brand-950/60 hover:text-brand-950'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm col-span-1">
                <span className="text-brand-950/60 text-xs">Nombre del plan</span>
                <input value={planName} onChange={(e) => setPlanName(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/60 text-xs">Precio ($)</span>
                <input type="number" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/60 text-xs">Ciclo</span>
                <select value={planCycle} onChange={(e) => pickCycle(e.target.value)} className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm bg-white">
                  {CYCLES.map((c) => (
                    <option key={c.label}>{c.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="border-t border-brand-950/[0.06] pt-3">
            <p className="text-sm font-bold text-brand-950 mb-1">Cargos únicos (instalación, extras…)</p>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {ITEM_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => addItem(p)}
                  className="rounded-full bg-brand-950/[0.05] px-3 py-1 text-xs font-semibold text-brand-950/60 hover:text-brand-950"
                >
                  + {p.label} (${p.amountUsd})
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2 mb-2">
              <label className="block text-xs flex-1">
                <span className="text-brand-950/60">Concepto</span>
                <input value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} placeholder="Instalación" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block text-xs w-24 shrink-0">
                <span className="text-brand-950/60">Monto ($)</span>
                <input type="number" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} placeholder="60" className="mt-1 w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <button type="button" onClick={() => addItem()} className="h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded-lg border border-brand-950/15 hover:bg-brand-950/5">
                <Plus className="h-4 w-4 text-brand-950" />
              </button>
            </div>
            {items.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {items.map((it, i) => (
                  <div key={`${it.label}-${i}`} className="flex items-center gap-2.5 bg-brand-950/[0.04] rounded-lg px-3 py-2">
                    <span className="flex-1 text-[13px] font-semibold text-brand-950">{it.label}</span>
                    <span className="text-xs text-brand-950/60">{money(it.amountUsd)}</span>
                    <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} className="text-brand-950/40 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="text-brand-950/70">Nota para el cliente (opcional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ej: precio especial válido hasta fin de mes." className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm" />
          </label>

          <div className="rounded-xl bg-brand-500/[0.06] px-4 py-3">
            <p className="text-sm font-bold text-brand-950">Pago inicial: {money(total)}</p>
            <p className="text-[11px] text-brand-950/50 font-light">
              Para comenzar: 50% ({money(total / 2)}) — el 50% restante a los 15 días.
              {items.length > 0 && ` Luego solo el plan: ${money(Number(planPrice) || 0)} (${planCycle.toLowerCase()}).`}
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={onClose}>
            Cancelar
          </TextureButton>
          <TextureButton
            variant="brand"
            size="default"
            className="!w-auto"
            disabled={saving || !clientName.trim() || clientPhone.trim().length < 7 || !planName.trim()}
            onClick={save}
          >
            {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear cotización'}
          </TextureButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Check, MessageCircle, Plus, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { InlinePanel } from '../InlinePanel';
import {
  buildPromoMessage,
  crmApi,
  SEGMENT_LABELS,
  waPhoneOf,
  type CrmSegment,
  type CrmSummary,
  type PromotionDetail,
  type PromotionRow,
} from './crmApi';

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';
const inputCls =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es-VE') : '—';
}

function discountLabel(p: Pick<PromotionRow, 'discountType' | 'discountValue'>, symbol: string): string {
  return p.discountType === 'PERCENT' ? `${Number(p.discountValue)}%` : formatBase(p.discountValue, symbol);
}

/**
 * CRM → Promociones: campañas con código canjeable. Se crea eligiendo la lista
 * (un segmento del CRM), se envía por WhatsApp cliente por cliente, y el cajero
 * canjea el código al cobrar — el canje queda registrado solo.
 */
export function PromotionsSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    crmApi
      .promotions()
      .then(setPromotions)
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las promociones.'));
  }, []);

  useEffect(load, [load]);

  async function toggleActive(p: PromotionRow) {
    try {
      await crmApi.updatePromotion(p.id, { isActive: !p.isActive });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar.');
    }
  }

  async function remove(p: PromotionRow) {
    if (confirmDeleteId !== p.id) {
      setConfirmDeleteId(p.id);
      setTimeout(() => setConfirmDeleteId((c) => (c === p.id ? null : c)), 3000);
      return;
    }
    try {
      await crmApi.deletePromotion(p.id);
      setConfirmDeleteId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar.');
    }
  }

  if (view === 'new') {
    return (
      <PromotionForm
        symbol={symbol}
        onClose={() => setView('list')}
        onSaved={(id) => {
          setSelectedId(id);
          setView('detail');
          load();
        }}
      />
    );
  }

  if (view === 'detail' && selectedId) {
    return (
      <PromotionDetailPanel
        id={selectedId}
        symbol={symbol}
        onClose={() => {
          setView('list');
          setSelectedId(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-light text-brand-950/50">
          Cada campaña genera un código: envíalo por WhatsApp a su lista y canjéalo en caja al cobrar.
        </p>
        <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setView('new')}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Crear promoción
        </TextureButton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {promotions.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="font-semibold text-brand-950">Todavía no hay promociones</p>
          <p className="mt-1 text-[13px] font-light text-brand-950/50">
            Crea la primera: eliges una lista de clientes, defines el descuento y el sistema arma el mensaje.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {promotions.map((p) => (
            <div key={p.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-bold text-brand-950">{p.name}</p>
                    <span className="rounded-full bg-brand-500/10 px-2 py-0.5 font-mono text-[12px] font-bold text-brand-600">
                      {p.code}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        p.expired
                          ? 'bg-brand-950/[0.06] text-brand-950/50'
                          : p.isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {p.expired ? 'Vencida' : p.isActive ? 'Activa' : 'Apagada'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] font-light text-brand-950/50">
                    {discountLabel(p, symbol)} de descuento
                    {p.segment && ` · lista: ${SEGMENT_LABELS[p.segment as CrmSegment] ?? 'A mano'}`}
                    {p.endsAt && ` · hasta ${fmtDate(p.endsAt)}`}
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-brand-950/60">
                    {p.sentCount} de {p.targetCount} enviados · {p.redemptionCount} canje{p.redemptionCount === 1 ? '' : 's'}
                    {Number(p.redeemedBase) > 0 && ` · ${formatBase(p.redeemedBase, symbol)} otorgados`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <TextureButton
                    variant="secondary"
                    size="sm"
                    className="!w-auto"
                    onClick={() => {
                      setSelectedId(p.id);
                      setView('detail');
                    }}
                  >
                    <MessageCircle className="mr-1 h-3.5 w-3.5" /> Enviar / detalle
                  </TextureButton>
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    className="rounded-full border border-brand-950/15 px-3 py-1.5 text-[12px] font-medium text-brand-950/60 transition-colors hover:bg-brand-950/[0.04]"
                  >
                    {p.isActive ? 'Apagar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                      confirmDeleteId === p.id ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {confirmDeleteId === p.id ? '¿Seguro?' : ''}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SEGMENT_HELP: Record<CrmSegment, string> = {
  ALL: 'todos los clientes del CRM',
  FREQUENT: 'clientes con 3+ visitas',
  NEW: 'clientes de los últimos 30 días',
  INACTIVE: 'sin visitas hace 45+ días',
  BIRTHDAY: 'cumplen años este mes',
};

/** El builder: descuento + vigencia + lista destino + mensaje con placeholders. */
function PromotionForm({
  symbol,
  onClose,
  onSaved,
}: {
  symbol: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [discountValue, setDiscountValue] = useState('');
  const [segment, setSegment] = useState<CrmSegment>('ALL');
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [code, setCode] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [message, setMessage] = useState('');
  const [restrictToTargets, setRestrictToTargets] = useState(true);
  const [maxPerCustomer, setMaxPerCustomer] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    crmApi
      .customers({})
      .then((d) => setSummary(d.summary))
      .catch(() => setSummary(null));
  }, []);

  const segmentCount = (s: CrmSegment) =>
    !summary
      ? null
      : s === 'ALL'
        ? summary.total
        : s === 'FREQUENT'
          ? summary.frequent
          : s === 'NEW'
            ? summary.new
            : s === 'INACTIVE'
              ? summary.inactive
              : summary.birthday;

  async function submit() {
    const value = Number(discountValue);
    if (!name.trim()) return setError('Escribe el nombre de la promoción.');
    if (!value || value <= 0) return setError('Escribe el descuento.');
    if (discountType === 'PERCENT' && value > 100) return setError('Un porcentaje no puede superar 100.');
    setSaving(true);
    setError(null);
    try {
      const created = await crmApi.createPromotion({
        name: name.trim(),
        discountType,
        discountValue: value,
        segment,
        code: code.trim() || undefined,
        startsAt: startsAt || undefined,
        endsAt: endsAt || undefined,
        message: message.trim() || undefined,
        restrictToTargets,
        maxPerCustomer: Number(maxPerCustomer) || 0,
      });
      onSaved(created.id);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la promoción.');
      setSaving(false);
    }
  }

  return (
    <InlinePanel
      title="Crear promoción"
      description="Se congela la lista de clientes del segmento elegido y se genera el código canjeable."
      onClose={onClose}
      size="wide"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Descuento cumpleañeros agosto)" className={inputCls} />

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-brand-950/70">Descuento</p>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-brand-950/15">
                {(['PERCENT', 'AMOUNT'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiscountType(t)}
                    className={`px-3 py-2 text-sm font-semibold transition-colors ${
                      discountType === t ? 'bg-brand-500 text-white' : 'bg-white text-brand-950/50 hover:bg-brand-950/[0.04]'
                    }`}
                  >
                    {t === 'PERCENT' ? '%' : symbol}
                  </button>
                ))}
              </div>
              <input
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={discountType === 'PERCENT' ? 'Ej. 10' : 'Ej. 5.00'}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-brand-950/70">Lista de clientes</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SEGMENT_LABELS) as CrmSegment[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSegment(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    segment === s ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  {SEGMENT_LABELS[s]}
                  {segmentCount(s) != null && ` (${segmentCount(s)})`}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] font-light text-brand-950/40">{SEGMENT_HELP[segment]}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-brand-950/50">Empieza (opcional)</span>
              <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-brand-950/50">Vence (opcional)</span>
              <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-brand-950/50">Código (vacío = automático)</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ej. CUMPLE10" className={`${inputCls} font-mono`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-brand-950/50">Canjes por cliente (0 = sin límite)</span>
              <input value={maxPerCustomer} onChange={(e) => setMaxPerCustomer(e.target.value.replace(/[^0-9]/g, ''))} className={inputCls} />
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-brand-950/70">
            <input type="checkbox" checked={restrictToTargets} onChange={(e) => setRestrictToTargets(e.target.checked)} className="h-4 w-4 accent-brand-500" />
            El código solo vale para los clientes de la lista
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-brand-950/70">Mensaje de WhatsApp (opcional)</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder={`¡Hola {{nombre}}! 🎉 Tenemos una promoción para ti: {{descuento}} de descuento con el código {{codigo}}. {{vigencia}}`}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] font-light text-brand-950/40">
            Se personaliza solo con {'{{nombre}}'}, {'{{codigo}}'}, {'{{descuento}}'} y {'{{vigencia}}'}. Vacío = plantilla de arriba.
          </p>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="mt-3 !w-auto disabled:opacity-50">
        <Tag className="mr-1 h-4 w-4" /> {saving ? 'Creando…' : 'Crear promoción'}
      </TextureButton>
    </InlinePanel>
  );
}

/** El detalle de la campaña: enviar por WhatsApp 1 a 1 y ver los canjes. */
function PromotionDetailPanel({ id, symbol, onClose }: { id: string; symbol: string; onClose: () => void }) {
  const [detail, setDetail] = useState<PromotionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    crmApi
      .promotionDetail(id)
      .then(setDetail)
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar la promoción.'));
  }, [id]);

  useEffect(load, [load]);

  async function send(target: { customerId: string; name: string; phone: string }) {
    if (!detail) return;
    const text = buildPromoMessage(detail, target.name, symbol);
    window.open(`https://wa.me/${waPhoneOf(target.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    try {
      await crmApi.markSent(id, target.customerId);
      load();
    } catch {
      // Si marcar falla, el mensaje igual salió; el botón queda disponible para reintentar.
    }
  }

  if (!detail) {
    return (
      <InlinePanel title="Promoción" onClose={onClose} closeLabel="← Volver">
        <p className="text-sm font-light text-brand-950/40">{error ?? 'Cargando…'}</p>
      </InlinePanel>
    );
  }

  const pending = detail.targets.filter((t) => !t.sentAt).length;

  return (
    <InlinePanel
      title={detail.name}
      description={`Código ${detail.code} · ${discountLabel(detail, symbol)} de descuento${detail.endsAt ? ` · vence ${fmtDate(detail.endsAt)}` : ''}`}
      onClose={onClose}
      closeLabel="← Volver"
      size="wide"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-950/40">
              Lista ({detail.targets.length})
            </p>
            <p className="text-[12px] font-light text-brand-950/45">
              {pending === 0 ? 'Todos recibieron su mensaje' : `${pending} por enviar`}
            </p>
          </div>
          <div className={`${card} divide-y divide-brand-950/[0.06] overflow-hidden`}>
            {detail.targets.map((t) => (
              <div key={t.customerId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-brand-950">{t.name}</span>
                  <span className="block text-xs font-light text-brand-950/40">{t.phone}</span>
                </span>
                {t.sentAt ? (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Enviada {fmtDate(t.sentAt)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => send(t)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-950/40">Mensaje que se envía</p>
            <div className={`${card} p-4 text-sm font-light text-brand-950/70`}>
              {buildPromoMessage(detail, 'María', symbol)}
              <p className="mt-2 text-[11px] text-brand-950/40">(ejemplo con una clienta llamada María)</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-950/40">
              Canjes ({detail.redemptions.length})
            </p>
            <div className={`${card} divide-y divide-brand-950/[0.06] overflow-hidden`}>
              {detail.redemptions.length === 0 && (
                <p className="p-4 text-sm font-light text-brand-950/40">
                  Nadie ha canjeado todavía. El cajero escribe el código {detail.code} al cobrar y el canje aparece acá.
                </p>
              )}
              {detail.redemptions.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-brand-950/50">{fmtDate(r.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-brand-950">{r.customerName}</span>
                  <span className="shrink-0 font-semibold text-emerald-600">−{formatBase(r.amountBase, symbol)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </InlinePanel>
  );
}

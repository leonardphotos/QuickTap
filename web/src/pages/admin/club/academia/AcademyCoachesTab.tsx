import { useCallback, useEffect, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Cell,
  ClubBadge,
  ClubEyebrow,
  ClubPanel,
  ClubRow,
  ClubTable,
  PlainCell,
  SubCell,
  type ClubColumn,
} from '../ClubTable';
import { academyApi, LEVELS, PAY_TYPE_LABELS, type Coach } from './academyApi';
import type { DetailTarget } from './AcademyDetails';

const COLS: ClubColumn[] = [
  { key: 'profesor', label: 'Profesor', width: 'minmax(0,1.2fr)' },
  { key: 'tel', label: 'Teléfono', width: '150px' },
  { key: 'niveles', label: 'Niveles', width: '150px' },
  { key: 'pago', label: 'Cómo se le paga', width: 'minmax(0,1.4fr)' },
  { key: 'estado', label: 'Estado', width: '116px' },
  { key: 'accion', label: '', width: '148px', align: 'right' },
];

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

const PAY_TYPES = Object.entries(PAY_TYPE_LABELS) as [Coach['payType'], string][];

/** Qué campos pide cada modo de pago. Espejo de la validación del DTO. */
function needsAmount(t: Coach['payType']) {
  return t === 'FIXED_PER_SESSION' || t === 'HOURLY' || t === 'MIXED';
}
function needsPercent(t: Coach['payType']) {
  return t === 'COMMISSION_ON_CONSUMED' || t === 'COMMISSION_ON_ENROLLMENT' || t === 'MIXED';
}

export default function AcademyCoachesTab({
  restaurant,
  onOpen,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  onOpen: (t: DetailTarget) => void;
}) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [payingTo, setPayingTo] = useState<Coach | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    academyApi
      .listCoaches()
      .then(setCoaches)
      .catch(() => setError('No pudimos cargar los profesores.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando profesores…</p>;

  return (
    <div className="flex flex-col gap-3.5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ClubEyebrow>Equipo docente</ClubEyebrow>
      <ClubPanel
        title="Profesores"
        description="A su WhatsApp llegan los avisos de clase asignada, alumno inscrito y sesión cancelada."
        action={
          <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Agregar
          </TextureButton>
        }
      >
        <ClubTable columns={COLS} rows={coaches.length} empty="Todavía no hay profesores.">
          {coaches.map((c) => (
            <ClubRow
              key={c.id}
              label={`Ver ${c.displayName}`}
              muted={!c.active}
              onClick={() => onOpen({ kind: 'coach', id: c.id })}
              cells={[
                <Cell key="n">{c.displayName}</Cell>,
                <PlainCell key="t" className="tabular-nums">
                  {c.phone}
                </PlainCell>,
                <PlainCell key="l">
                  {c.levelMin && c.levelMax
                    ? `${Number(c.levelMin).toFixed(1)}–${Number(c.levelMax).toFixed(1)}`
                    : 'Cualquiera'}
                </PlainCell>,
                <>
                  <PlainCell>{PAY_TYPE_LABELS[c.payType]}</PlainCell>
                  {(c.payAmountBase || c.commissionPercent) && (
                    <SubCell>
                      {c.payAmountBase && formatBase(c.payAmountBase, symbol)}
                      {c.payAmountBase && c.commissionPercent && ' · '}
                      {c.commissionPercent && `${Number(c.commissionPercent)}%`}
                    </SubCell>
                  )}
                </>,
                <ClubBadge key="e" tone={c.active ? 'brand' : 'neutral'}>
                  {c.active ? 'Activo' : 'Inactivo'}
                </ClubBadge>,
                <TextureButton
                  key="a"
                  variant="minimal"
                  size="sm"
                  className="!w-auto"
                  onClick={() => setPayingTo(c)}
                >
                  <Wallet className="mr-1 h-3 w-3" />
                  Honorarios
                </TextureButton>,
              ]}
            />
          ))}
        </ClubTable>
      </ClubPanel>

      {creating && (
        <CoachDialog
          symbol={symbol}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {payingTo && <EarningsDialog coach={payingTo} symbol={symbol} onClose={() => setPayingTo(null)} />}
    </div>
  );
}

function CoachDialog({ symbol, onClose, onSaved }: { symbol: string; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [levelMin, setLevelMin] = useState('');
  const [levelMax, setLevelMax] = useState('');
  const [payType, setPayType] = useState<Coach['payType']>('FIXED_PER_SESSION');
  const [payAmount, setPayAmount] = useState('');
  const [commission, setCommission] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!displayName.trim() || !phone.trim()) return setError('Nombre y teléfono son obligatorios.');
    setSaving(true);
    setError(null);
    try {
      await academyApi.createCoach({
        displayName: displayName.trim(),
        phone: phone.trim(),
        levelMin: levelMin ? Number(levelMin) : null,
        levelMax: levelMax ? Number(levelMax) : null,
        payType,
        payAmountBase: needsAmount(payType) && payAmount ? Number(payAmount) : null,
        commissionPercent: needsPercent(payType) && commission ? Number(commission) : null,
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo guardar.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo profesor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={INPUT} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Teléfono (WhatsApp) *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} placeholder="04141234567" />
          </Field>
          <p className="text-xs font-light text-brand-950/40">
            A este número le llegan los avisos cuando se le asigna una clase, se le inscribe un alumno o se le cancela una
            sesión.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Nivel desde">
              <select value={levelMin} onChange={(e) => setLevelMin(e.target.value)} className={INPUT}>
                <option value="">Cualquiera</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l.toFixed(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nivel hasta">
              <select value={levelMax} onChange={(e) => setLevelMax(e.target.value)} className={INPUT}>
                <option value="">Cualquiera</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l.toFixed(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Cómo se le paga">
            <select value={payType} onChange={(e) => setPayType(e.target.value as Coach['payType'])} className={INPUT}>
              {PAY_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {payType === 'COMMISSION_ON_CONSUMED' && (
            <p className="text-xs font-light text-brand-950/40">
              Cobra menos si faltan alumnos: comparte el riesgo con el club.
            </p>
          )}
          {payType === 'COMMISSION_ON_ENROLLMENT' && (
            <p className="text-xs font-light text-brand-950/40">
              Cobra igual asistan o no: el riesgo de las ausencias lo asume el club.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {needsAmount(payType) && (
              <Field label={`Monto (${symbol})`}>
                <input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={INPUT} placeholder="0.00" />
              </Field>
            )}
            {needsPercent(payType) && (
              <Field label="Comisión %">
                <input type="number" min="0" max="100" step="0.1" value={commission} onChange={(e) => setCommission(e.target.value)} className={INPUT} placeholder="40" />
              </Field>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Earnings {
  sessionsCount: number;
  totalBase: string;
  paidBase: string;
  pendingBase: string;
}

function EarningsDialog({ coach, symbol, onClose }: { coach: Coach; symbol: string; onClose: () => void }) {
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    academyApi
      .coachEarnings(coach.id, from, to)
      .then((d) => setData(d as Earnings))
      .catch(() => setError('No pudimos cargar los honorarios.'))
      .finally(() => setLoading(false));
  }, [coach.id, from, to]);

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      await academyApi.payCoach(coach.id, { from, to, registerExpense: true, paymentMethod: 'CASH_USD' });
      setDone(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo liquidar.');
      setPaying(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Honorarios de {coach.displayName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm font-light text-brand-950/40">Cargando…</p>
        ) : done ? (
          <p className="py-4 text-center text-sm font-semibold text-emerald-700">
            Liquidado y registrado como gasto de nómina.
          </p>
        ) : data ? (
          <div className="space-y-3">
            <p className="text-xs font-light text-brand-950/50">Últimos 30 días</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-brand-950/[0.04] p-3">
                <p className="text-[20px] font-bold leading-tight text-brand-950">{data.sessionsCount}</p>
                <p className="text-xs font-semibold text-brand-950/60">clases dadas</p>
              </div>
              <div className="rounded-2xl bg-brand-950/[0.04] p-3">
                <p className="text-[20px] font-bold leading-tight text-brand-950">{formatBase(data.pendingBase, symbol)}</p>
                <p className="text-xs font-semibold text-brand-950/60">por pagar</p>
              </div>
            </div>
            <p className="text-xs font-light text-brand-950/40">
              Al liquidar se registra un gasto de nómina, para que el honorario pese en el balance y en el cierre de caja.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <TextureButton
              variant="brand"
              size="default"
              disabled={paying || Number(data.pendingBase) <= 0}
              className="disabled:opacity-50"
              onClick={pay}
            >
              {paying ? 'Liquidando…' : `Liquidar ${formatBase(data.pendingBase, symbol)}`}
            </TextureButton>
          </div>
        ) : (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-brand-950/70">{label}</span>
      {children}
    </label>
  );
}

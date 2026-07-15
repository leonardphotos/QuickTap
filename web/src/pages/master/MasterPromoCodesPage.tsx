import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

type DurationUnit = 'HOUR' | 'DAY' | 'MONTH' | 'YEAR';

const DURATION_UNIT_LABEL: Record<DurationUnit, string> = {
  HOUR: 'hora(s)',
  DAY: 'día(s)',
  MONTH: 'mes(es)',
  YEAR: 'año(s)',
};

interface PromoCode {
  id: string;
  code: string;
  discountPercent: number;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export default function MasterPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(10);
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('DAY');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    masterApi.get('/master/promo-codes').then((res) => setCodes(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await masterApi.post('/master/promo-codes', {
        code,
        discountPercent,
        ...(durationValue ? { durationValue: Number(durationValue), durationUnit } : {}),
      });
      setCode('');
      setDiscountPercent(10);
      setDurationValue('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear el código.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(promo: PromoCode) {
    await masterApi.patch(`/master/promo-codes/${promo.id}`, { isActive: !promo.isActive });
    load();
  }

  async function remove(promo: PromoCode) {
    if (!confirm(`¿Eliminar el código ${promo.code}?`)) return;
    await masterApi.delete(`/master/promo-codes/${promo.id}`);
    load();
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Códigos promocionales</h1>

      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-brand-950/70">Código</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="LANZAMIENTO20"
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 uppercase"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Descuento: {discountPercent}%</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              className="w-full mt-2.5 accent-brand-500"
            />
          </label>
        </div>

        <div>
          <span className="text-sm text-brand-950/70">Vencimiento (opcional)</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min={1}
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              placeholder="Sin vencimiento"
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
              disabled={!durationValue}
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              {(Object.keys(DURATION_UNIT_LABEL) as DurationUnit[]).map((u) => (
                <option key={u} value={u}>
                  {DURATION_UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-brand-950/40 font-light mt-1">
            El código deja de funcionar automáticamente al vencer. Déjalo vacío para que no venza.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto px-5 disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear código'}
        </TextureButton>
      </form>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {codes?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin códigos todavía.</p>}
        {codes?.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-brand-950">{c.code}</p>
              <p className="text-xs text-brand-950/40 font-light">
                -{c.discountPercent}%
                {c.expiresAt && (
                  <>
                    {' · '}
                    {new Date(c.expiresAt).getTime() < Date.now() ? (
                      <span className="text-red-500">Venció el {new Date(c.expiresAt).toLocaleDateString('es-VE')}</span>
                    ) : (
                      <>Vence el {new Date(c.expiresAt).toLocaleDateString('es-VE')}</>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleActive(c)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-950/[0.06] text-brand-950/50'
                }`}
              >
                {c.isActive ? 'Activo' : 'Inactivo'}
              </button>
              <button onClick={() => remove(c)} className="text-xs text-red-600 hover:text-red-700">
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

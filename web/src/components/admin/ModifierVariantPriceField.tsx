import { useState } from 'react';
import { api } from '@/api/client';

/** Edita solo el precio: conserva cualquier consumo de inventario de esta variante. */
export function ModifierVariantPriceField({ modifierId, variantId, variantName, initialPrice, symbol }: {
  modifierId: string;
  variantId: string;
  variantName: string;
  initialPrice: string;
  symbol: string;
}) {
  const [price, setPrice] = useState(initialPrice);
  const [saved, setSaved] = useState(initialPrice);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const normalized = price.trim().replace(',', '.');
  const valid = /^\d+(\.\d{1,2})?$/.test(normalized) && Number.isFinite(Number(normalized));
  const changed = normalized !== '' && Number(normalized) !== Number(saved);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/modifier-categories/modifiers/${modifierId}/variant-prices/${variantId}`, {
        priceBase: Number(normalized),
      });
      setSaved(normalized);
    } catch {
      setError('No se pudo guardar. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-1">
      <label className="block text-brand-950/60 text-sm font-medium">
        {variantName} ({symbol})
        <input
          aria-label={`Precio del modificador en ${variantName}`}
          inputMode="decimal"
          value={price}
          disabled={saving}
          onChange={(event) => { setPrice(event.target.value); setError(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }}
          className="mt-1 w-full rounded-lg border border-brand-950/15 bg-white px-2 py-1.5 text-brand-950 text-base"
        />
      </label>
      <button type="button" disabled={!valid || !changed || saving} onClick={() => void save()}
        className="text-xs font-medium text-brand-500 disabled:text-brand-950/40">
        {saving ? 'Guardando…' : changed ? 'Guardar precio' : 'Guardado'}
      </button>
      {(!valid || error) && <p role="alert" className="text-red-500 text-xs">{error || 'Introduce un precio válido, hasta dos decimales.'}</p>}
    </div>
  );
}

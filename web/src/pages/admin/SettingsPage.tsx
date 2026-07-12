import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Currency } from '../../types';
import { formatBsAbsolute } from '../../utils/format';

interface RateInfo {
  currency: Currency;
  rateBs: string | null;
  fetchedAt: string | null;
  source: string | null;
  stale: boolean;
}

const CURRENCY_LABELS: Record<Currency, string> = { USD: 'Dólares ($)', EUR: 'Euros (€)' };

export default function SettingsPage() {
  const { restaurant, refresh } = useAuth();
  const [whatsappPhone, setWhatsappPhone] = useState(restaurant?.whatsappPhone ?? '');
  const [baseCurrency, setBaseCurrency] = useState<Currency>(restaurant?.baseCurrency ?? 'USD');
  const [rates, setRates] = useState<Record<Currency, RateInfo> | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadRates() {
    api.get('/exchange-rates').then((res) => setRates(res.data.data));
  }

  useEffect(loadRates, []);

  async function saveCurrency() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { baseCurrency, whatsappPhone: whatsappPhone || undefined });
      await refresh();
      setMessage('Configuración guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function refreshRates() {
    setRefreshing(true);
    try {
      const { data } = await api.post('/exchange-rates/refresh');
      setRates(data.data);
    } finally {
      setRefreshing(false);
    }
  }

  const activeRate = rates?.[baseCurrency];

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900">Ajustes</h1>

      <section className="bg-white border rounded-xl p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Tasa cambiaria</h2>
          <p className="text-sm text-gray-500">
            Elige en qué moneda colocas tus precios. La conversión a bolívares que ven tus clientes se calcula
            automáticamente con la tasa oficial del Banco Central de Venezuela (BCV).
          </p>
        </div>

        <div className="flex gap-2">
          {(['USD', 'EUR'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setBaseCurrency(c)}
              className={`flex-1 rounded-lg py-2 text-sm border ${
                baseCurrency === c ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'
              }`}
            >
              {CURRENCY_LABELS[c]}
            </button>
          ))}
        </div>

        {activeRate && (
          <div className="text-sm bg-gray-50 rounded-lg p-3 space-y-1">
            {activeRate.rateBs ? (
              <>
                <p>
                  Tasa BCV vigente: <span className="font-semibold">{formatBsAbsolute(activeRate.rateBs)}</span> /{' '}
                  {baseCurrency === 'USD' ? '$1' : '€1'}
                </p>
                <p className="text-xs text-gray-500">
                  Actualizada: {new Date(activeRate.fetchedAt!).toLocaleString('es-VE')} · Fuente: {activeRate.source}
                </p>
                {activeRate.stale && (
                  <p className="text-xs text-amber-600">
                    ⚠️ Esta tasa tiene más de {' '}
                    {Math.round((Date.now() - new Date(activeRate.fetchedAt!).getTime()) / 3600000)}h de antigüedad.
                  </p>
                )}
              </>
            ) : (
              <p className="text-amber-600">Aún no se ha obtenido una tasa BCV para esta moneda.</p>
            )}
            <button
              onClick={refreshRates}
              disabled={refreshing}
              className="text-xs font-medium text-gray-700 underline disabled:opacity-50"
            >
              {refreshing ? 'Actualizando…' : 'Actualizar tasa ahora'}
            </button>
          </div>
        )}

        <label className="block text-sm">
          <span className="text-gray-600">WhatsApp del restaurante</span>
          <input
            value={whatsappPhone}
            onChange={(e) => setWhatsappPhone(e.target.value)}
            placeholder="584141234567"
            className="mt-1 w-full border rounded-lg px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}

        <button
          onClick={saveCurrency}
          disabled={saving}
          className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </section>
    </div>
  );
}

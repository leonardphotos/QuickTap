import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

interface PreviewProduct {
  externalSourceId: string;
  name: string;
  price: number | null;
  currency: string | null;
  importedImageUrl: string | null;
  hasPhoto: boolean;
  variants: { externalSourceId: string; name: string; price: number | null }[];
}

interface PreviewCategory {
  externalSourceId: string;
  name: string;
  products: PreviewProduct[];
}

interface PreviewResponse {
  categories: PreviewCategory[];
  summary: {
    totalCategories: number;
    totalProducts: number;
    productsWithImportedPhoto: number;
    productsMissingPhoto: number;
    productsWithVariants: number;
    sourceCurrencies: string[];
    baseCurrency: string;
    currencyMismatch: boolean;
  };
}

type Step = 'idle' | 'connecting' | 'connected' | 'loading_preview' | 'preview' | 'confirming' | 'done';

/**
 * Herramienta interna (panel master) para migrar el menú de un restaurante
 * desde OlaClick. El restaurante nunca ve esta pantalla — la usa el equipo
 * de QuickTap durante el onboarding, con la API Key que el restaurante
 * comparte por un canal interno. Ver README de la migración en el módulo
 * backend (src/modules/master/master-olaclick-import.*) para el contexto
 * de riesgo legal detrás de esta decisión.
 */
export default function MasterOlaClickImportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [apiKey, setApiKey] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<Record<string, number> | null>(null);

  async function handleConnect() {
    setError(null);
    setStep('connecting');
    try {
      await masterApi.post(`/master/olaclick-import/${id}/connect`, { apiKey });
      setStep('connected');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo conectar.');
      setStep('idle');
    }
  }

  async function handlePreview() {
    setError(null);
    setStep('loading_preview');
    try {
      const res = await masterApi.post<{ data: PreviewResponse }>(`/master/olaclick-import/${id}/preview`);
      setPreview(res.data.data);
      setStep('preview');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo traer el menú.');
      setStep('connected');
    }
  }

  function toggleExclude(externalId: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  }

  async function handleConfirm() {
    setError(null);
    setStep('confirming');
    try {
      const res = await masterApi.post(`/master/olaclick-import/${id}/confirm`, {
        excludedProductExternalIds: Array.from(excluded),
      });
      setSavedSummary(res.data.data);
      setStep('done');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo guardar la importación.');
      setStep('preview');
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 space-y-6">
      <button onClick={() => navigate(`/master/restaurants/${id}`)} className="text-sm text-brand-500 hover:underline">
        ← Volver al restaurante
      </button>

      <div className="rounded-lg border border-dashed border-brand-950/20 bg-brand-950/5 px-4 py-2 text-center text-xs font-medium text-brand-900">
        Herramienta interna — solo equipo QuickTap. El restaurante no ve esta pantalla.
      </div>

      <h1 className="text-xl font-semibold text-brand-950">Migrar menú desde OlaClick</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {(step === 'idle' || step === 'connecting') && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-brand-950">API Key de OlaClick (compartida por el restaurante)</label>
          <input
            type="text"
            placeholder="olk_live_..."
            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <TextureButton
            variant="brand"
            size="sm"
            disabled={!apiKey || step === 'connecting'}
            className="!w-auto disabled:opacity-50"
            onClick={handleConnect}
          >
            {step === 'connecting' ? 'Conectando...' : 'Conectar'}
          </TextureButton>
        </div>
      )}

      {step === 'connected' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-brand-500">Cuenta conectada correctamente.</p>
          <TextureButton variant="brand" size="sm" className="!w-auto" onClick={handlePreview}>
            Ver vista previa del menú
          </TextureButton>
        </div>
      )}

      {step === 'loading_preview' && <p className="text-sm text-brand-950/60">Trayendo el menú desde OlaClick...</p>}

      {(step === 'preview' || step === 'confirming') && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-brand-950/5 p-4 text-sm text-brand-950">
            <span>Categorías encontradas:</span>
            <strong className="text-right">{preview.summary.totalCategories}</strong>
            <span>Productos encontrados:</span>
            <strong className="text-right">{preview.summary.totalProducts}</strong>
            <span>Con foto ya importada:</span>
            <strong className="text-right">{preview.summary.productsWithImportedPhoto}</strong>
            <span>Sin foto (habrá que subirla):</span>
            <strong className="text-right">{preview.summary.productsMissingPhoto}</strong>
            <span>Con variantes:</span>
            <strong className="text-right">{preview.summary.productsWithVariants}</strong>
            <span>Moneda en OlaClick:</span>
            <strong className="text-right">{preview.summary.sourceCurrencies.join(' / ') || '—'}</strong>
          </div>

          {preview.summary.currencyMismatch && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <strong>Ojo con la moneda.</strong> OlaClick declara los precios en{' '}
              {preview.summary.sourceCurrencies.join(' / ')} y este restaurante cobra en{' '}
              {preview.summary.baseCurrency}. Los montos se importan tal cual, sin convertir — si
              hace falta convertirlos, hay que ajustar los precios después en el catálogo o cambiar
              la moneda base del restaurante antes de importar.
            </div>
          )}

          <div className="max-h-96 divide-y divide-brand-950/10 overflow-y-auto rounded-lg border border-brand-950/10">
            {preview.categories.map((cat) => (
              <div key={cat.externalSourceId} className="p-3">
                <div className="mb-2 font-medium text-brand-950">{cat.name}</div>
                <div className="space-y-2">
                  {cat.products.map((prod) => {
                    const isExcluded = excluded.has(prod.externalSourceId);
                    return (
                      <div key={prod.externalSourceId} className={isExcluded ? 'opacity-50' : ''}>
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleExclude(prod.externalSourceId)}
                        />
                        {prod.importedImageUrl ? (
                          <img src={prod.importedImageUrl} alt={prod.name} className="h-8 w-8 rounded-md object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-950/10 text-[10px] text-brand-950/50">
                            sin foto
                          </span>
                        )}
                        <span className="flex-1 text-brand-950">{prod.name}</span>
                        <span className="text-brand-950/50">
                          {prod.price === null ? 'sin precio' : `${prod.currency ?? ''} ${prod.price.toFixed(2)}`.trim()}
                        </span>
                      </label>
                      {prod.variants.length > 0 && (
                        <ul className="ml-11 mt-1 space-y-0.5">
                          {prod.variants.map((v) => (
                            <li key={v.externalSourceId} className="flex justify-between text-xs text-brand-950/55">
                              <span>{v.name}</span>
                              <span>{v.price === null ? '—' : v.price.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <TextureButton
            variant="brand"
            size="sm"
            disabled={step === 'confirming'}
            className="!w-auto disabled:opacity-50"
            onClick={handleConfirm}
          >
            {step === 'confirming' ? 'Guardando...' : 'Confirmar importación'}
          </TextureButton>
        </div>
      )}

      {step === 'done' && savedSummary && (
        <div className="space-y-2 text-sm text-brand-500">
          <p>
            Listo. Se guardaron {savedSummary.totalProducts} productos en {savedSummary.totalCategories} categorías.
            {savedSummary.productsMissingPhoto > 0 && (
              <> {savedSummary.productsMissingPhoto} quedaron sin foto — súbelas desde el catálogo del restaurante.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';
import type { ShopSession } from './shopSession';

/**
 * Ajustes → Tienda virtual: el enlace público del local, su costo de envío y qué productos se
 * muestran en la vitrina.
 *
 * Publicar es opt-in a propósito y el botón de "publicar todos" avisa por qué: el inventario de
 * un local también tiene INSUMOS (cera, shampoo, material de impresión) que se consumen por
 * dentro y no se le venden a nadie por internet — publicarlos de un saque los expondría con su
 * precio.
 */
export function ShopStorefrontSection({ session }: { session: ShopSession }) {
  const { restaurant, refresh } = useAuth();
  const [fee, setFee] = useState(String(restaurant?.shopDeliveryFee ?? ''));
  const [ordering, setOrdering] = useState(restaurant?.orderingEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!restaurant) return null;

  const url = `${window.location.origin}/tienda/${restaurant.slug}`;
  const products = session.products;
  const published = products.filter((p) => p.isPublished);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage('No pudimos copiar el enlace. Selecciónalo y cópialo a mano.');
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const trimmed = fee.trim();
      await api.patch('/restaurant', {
        orderingEnabled: ordering,
        shopDeliveryFee: trimmed ? Number(trimmed) : 0,
      });
      await refresh();
      setMessage('Guardado.');
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function setAllPublished(isPublished: boolean) {
    const ids = products.map((p) => p.id);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setMessage(null);
    session.setProductsPublished(ids, isPublished);
    setMessage(isPublished ? 'Todos los productos quedaron publicados.' : 'Se quitaron todos de la tienda.');
    setBulkBusy(false);
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Tienda virtual</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Tu catálogo en internet. Comparte el enlace y los pedidos te llegan a la pantalla Pedidos.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-5">
        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-1.5">Enlace de tu tienda</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-brand-950/[0.04] px-3 py-2 text-xs text-brand-950">
              {url}
            </code>
            <button
              onClick={copyLink}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-950/[0.06] text-brand-950/60 hover:text-brand-950"
              aria-label="Copiar enlace"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-950/[0.06] text-brand-950/60 hover:text-brand-950"
              aria-label="Abrir tienda"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={ordering}
            onChange={(e) => setOrdering(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
          />
          <span>
            <span className="block text-sm font-medium text-brand-950">Recibir pedidos por internet</span>
            <span className="block text-xs font-light text-brand-950/50">
              Si lo apagas, la gente sigue viendo tu catálogo pero no puede pedir.
            </span>
          </span>
        </label>

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-1.5">Costo de envío ({restaurant.currencySymbol ?? '$'})</p>
          <p className="mb-2 text-xs font-light text-brand-950/40">
            Tarifa única para los pedidos con delivery. Déjalo en 0 si no cobras envío.
          </p>
          <input
            type="number"
            min="0"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="0.00"
            className="w-40 rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
          />
        </div>

        <TextureButton variant="minimal" size="default" disabled={saving} className="!w-auto disabled:opacity-50" onClick={save}>
          {saving ? 'Guardando…' : 'Guardar'}
        </TextureButton>

        <div className="border-t border-brand-950/[0.06] pt-4">
          <p className="text-sm font-medium text-brand-950/70">
            Productos en la vitrina: {published.length} de {products.length}
          </p>
          <p className="mt-1 text-xs font-light text-brand-950/40">
            Enciende cada producto desde Inventario. Ojo con publicar todo de un saque: si tu
            inventario tiene insumos que usas por dentro (cera, material, envases), también
            quedarían a la vista con su precio.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <TextureButton
              variant="minimal"
              size="sm"
              disabled={bulkBusy || products.length === 0}
              className="!w-auto disabled:opacity-50"
              onClick={() => setAllPublished(true)}
            >
              Publicar todos
            </TextureButton>
            <TextureButton
              variant="minimal"
              size="sm"
              disabled={bulkBusy || published.length === 0}
              className="!w-auto disabled:opacity-50"
              onClick={() => setAllPublished(false)}
            >
              Quitar todos
            </TextureButton>
          </div>
        </div>

        {message && <p className="text-sm text-brand-950/70">{message}</p>}
      </TextureCardContent>
    </TextureCard>
  );
}

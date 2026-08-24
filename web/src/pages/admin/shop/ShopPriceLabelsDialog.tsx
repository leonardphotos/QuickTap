import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import type { ShopProduct } from './shopSession';
import { shopMoneyFormatters } from './shopFormat';
import type { AuthRestaurant } from '@/context/AuthContext';

/**
 * Etiquetas de precio para impresora térmica de rollo (una etiqueta angosta autoadhesiva por
 * producto, tipo Zebra). El código escaneable es un QR con el SKU y no un Code128: el negocio
 * no tiene lector de barras dedicado, así que el mismo lector de cámara que ya usa QuickTap
 * para buscar productos en Venta (ver ShopBarcodeScanDialog, @zxing/browser) sirve igual — esa
 * librería prueba todos los formatos por defecto, QR incluido.
 *
 * Una etiqueta por unidad de stock por defecto (el caso normal: pegar una en cada pieza), mismo
 * criterio que la cantidad se puede corregir a mano si el negocio prefiere menos.
 */

interface Props {
  product: ShopProduct;
  restaurant: Pick<AuthRestaurant, 'name' | 'currencySymbol' | 'exchangeRate'>;
  onClose: () => void;
}

export function ShopPriceLabelsDialog({ product, restaurant, onClose }: Props) {
  const { money } = shopMoneyFormatters(restaurant);
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    Object.fromEntries(product.variants.map((v) => [v.v1 + v.v2, String(Math.max(1, Math.round(v.stock)))])),
  );

  const etiquetas = product.variants.flatMap((v) => {
    const n = Math.max(0, Math.round(Number(cantidades[v.v1 + v.v2]) || 0));
    const precio = v.price ?? product.price;
    const variante = v.v1 === 'Único' && !v.v2 ? '' : [v.v1, v.v2].filter(Boolean).join(' · ');
    return Array.from({ length: n }, () => ({ variante, precio, codigo: product.sku || product.id }));
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="print:!static print:!m-0 print:!max-w-none print:!border-0 print:!shadow-none">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #shop-labels-print, #shop-labels-print * { visibility: visible; }
            #shop-labels-print { position: absolute; top: 0; left: 0; }
            /* Rollo térmico angosto — ajusta acá si el rollo del negocio es otro ancho. */
            @page { size: 50mm 30mm; margin: 2mm; }
            .shop-label { page-break-after: always; }
            .shop-label:last-child { page-break-after: auto; }
          }
        `}</style>

        <div className="print:hidden">
          <DialogHeader>
            <DialogTitle>Etiquetas — {product.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-light text-brand-950/60">
            Una etiqueta por cantidad. Arranca con lo que hay en existencia; ajústalo si necesitas otra cantidad.
          </p>
          <div className="mt-3 space-y-2">
            {product.variants.map((v) => (
              <label key={v.v1 + v.v2} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-brand-950/70">
                  {v.v1 === 'Único' && !v.v2 ? product.name : [v.v1, v.v2].filter(Boolean).join(' · ')}
                </span>
                <input
                  type="number"
                  min="0"
                  value={cantidades[v.v1 + v.v2] ?? ''}
                  onChange={(e) => setCantidades((prev) => ({ ...prev, [v.v1 + v.v2]: e.target.value }))}
                  className="w-20 rounded-lg border border-brand-950/15 px-2 py-1.5 text-center"
                />
              </label>
            ))}
          </div>
          {!product.sku && (
            <p className="mt-2 text-xs text-amber-600">
              Este producto no tiene SKU cargado — la etiqueta va sin código escaneable, solo con el nombre y el precio.
            </p>
          )}
        </div>

        {/* La hoja imprimible: oculta en pantalla (print:hidden arriba la deja ver solo al
            imprimir), CSS aparte la recorta al tamaño del rollo. */}
        <div id="shop-labels-print" className="hidden print:block">
          {etiquetas.map((e, i) => (
            <div key={i} className="shop-label flex h-[26mm] w-[46mm] flex-col items-center justify-center gap-0.5 p-1 text-center">
              <p className="max-w-full truncate text-[8px] font-medium text-black">{restaurant.name}</p>
              <p className="line-clamp-2 max-w-full text-[9px] font-bold leading-tight text-black">{product.name}</p>
              {e.variante && <p className="text-[8px] text-black">{e.variante}</p>}
              <p className="text-[13px] font-black text-black">{money(e.precio)}</p>
              <QRCodeSVG value={e.codigo} size={40} />
              {product.sku && <p className="text-[7px] text-black">{product.sku}</p>}
            </div>
          ))}
        </div>

        <DialogFooter className="print:hidden">
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={onClose}>
            Cerrar
          </TextureButton>
          <TextureButton
            variant="brand"
            size="default"
            className="!w-auto disabled:opacity-40"
            disabled={etiquetas.length === 0}
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" /> Imprimir {etiquetas.length > 0 ? `(${etiquetas.length})` : ''}
          </TextureButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, ScanLine, X } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import ScannerModal from './ScannerModal';
import type { ShopVariant } from '@/data/shopRubros';
import { productStatus, productStock, type ShopProduct } from './shopSession';
import { useBarcodeCamera } from './useBarcodeCamera';
import { playScannerSound } from './shopSounds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ShopProduct[];
  money: (n: number) => string;
  onAdd: (product: ShopProduct, variant: ShopVariant, qty: number) => void;
}

function bestVariant(product: ShopProduct): ShopVariant {
  return product.variants.find((v) => v.stock > 0) ?? product.variants[0];
}

/**
 * Escáner de códigos de barra con la cámara del celular — usa @zxing/browser (funciona en
 * iOS Safari y Android Chrome vía getUserMedia, no depende de la BarcodeDetector API nativa que
 * no existe en Safari). Al detectar un código lo busca contra el catálogo: si matchea, muestra el
 * producto con cantidad editable y un botón "Añadir"; si no, avisa que no se encontró y sigue
 * escaneando. La cámara se libera siempre al cerrar el diálogo (evita dejarla prendida en segundo
 * plano). Usa ScannerModal (sin backdrop-filter) en vez del <Dialog> compartido — ver ese archivo.
 */
export default function ShopBarcodeScanDialog({ open, onOpenChange, products, money, onAdd }: Props) {
  const [matched, setMatched] = useState<ShopProduct | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const variant = matched ? bestVariant(matched) : null;
  const isWeight = !!variant?.soldByWeight;

  // Dedup del beep: sin este ref, mientras el código no matchea ningún producto la cámara sigue
  // reintentando en cada frame (a diferencia de cuando sí matchea, que se congela en `matched`) —
  // sin esto el beep sonaría en bucle mientras el código siga en cuadro.
  const lastBeepCodeRef = useRef<string | null>(null);

  const { videoRef, cameraError } = useBarcodeCamera(open, (code) => {
    if (lastBeepCodeRef.current !== code) {
      lastBeepCodeRef.current = code;
      playScannerSound();
    }
    setMatched((prevMatched) => {
      // Ya hay un match mostrándose — ignora nuevas lecturas hasta que el cajero decida
      // (Añadir o descartar), si no el mismo código sigue disparando en cada frame.
      if (prevMatched) return prevMatched;
      const found = products.find((p) => p.sku.toLowerCase() === code.toLowerCase());
      if (found) {
        setNotFoundCode(null);
        setQtyInput('1');
        return found;
      }
      setNotFoundCode(code);
      return null;
    });
  });

  useEffect(() => {
    if (!open) return;
    setMatched(null);
    setNotFoundCode(null);
    setJustAdded(null);
    setQtyInput('1');
    lastBeepCodeRef.current = null;
  }, [open]);

  function resumeScanning() {
    setMatched(null);
    setNotFoundCode(null);
  }

  function confirmAdd() {
    if (!matched || !variant) return;
    const qty = Number(qtyInput);
    if (!(qty > 0)) return;
    onAdd(matched, variant, qty);
    setJustAdded(matched.name);
    setTimeout(() => setJustAdded(null), 1600);
    resumeScanning();
  }

  return (
    <ScannerModal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Escanear producto"
      footer={
        <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => onOpenChange(false)}>
          Cerrar
        </TextureButton>
      }
    >
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline />
        {!matched && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 aspect-[3/1] border-2 border-white/70 rounded-lg" />
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/80">
            <p className="text-sm text-white text-center">{cameraError} Revisa los permisos de cámara del navegador.</p>
          </div>
        )}
      </div>

      {justAdded && (
        <p className="text-[13px] font-semibold text-emerald-600 text-center">✓ Agregado: {justAdded}</p>
      )}

      {matched && variant ? (
        <div className="rounded-xl border border-brand-950/10 p-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-brand-950 truncate">{matched.name}</p>
              <p className="text-xs text-brand-950/40">
                {money(matched.price)}{isWeight ? ' / Kg' : ''} · {STATUS_LABEL[productStatus(matched)]} · {productStock(matched)}{isWeight ? ' Kg' : ''} en stock
              </p>
            </div>
            <button type="button" onClick={resumeScanning} className="shrink-0 text-brand-950/30 hover:text-red-500">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-brand-950/70">Cantidad{isWeight ? ' (Kg)' : ''}</span>
            {isWeight ? (
              <input
                type="number"
                step="0.001"
                min="0"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                autoFocus
                className="flex-1 border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              />
            ) : (
              <div className="flex items-center border border-brand-950/15 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQtyInput((q) => String(Math.max(1, (Number(q) || 1) - 1)))}
                  className="h-9 w-9 flex items-center justify-center hover:bg-brand-950/5"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-10 text-center text-sm font-semibold">{qtyInput}</span>
                <button
                  type="button"
                  onClick={() => setQtyInput((q) => String((Number(q) || 0) + 1))}
                  className="h-9 w-9 flex items-center justify-center hover:bg-brand-950/5"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <TextureButton variant="brand" size="default" className="w-full justify-center" disabled={!(Number(qtyInput) > 0)} onClick={confirmAdd}>
            Añadir
          </TextureButton>
        </div>
      ) : notFoundCode ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-center justify-between gap-2">
          <p className="text-[13px] text-amber-700">Sin coincidencias para el código <span className="font-semibold">{notFoundCode}</span>.</p>
          <TextureButton variant="minimal" size="sm" className="!w-auto shrink-0" onClick={resumeScanning}>
            Reintentar
          </TextureButton>
        </div>
      ) : (
        <p className="text-[13px] text-brand-950/40 text-center flex items-center justify-center gap-1.5">
          <ScanLine className="h-3.5 w-3.5" /> Apunta la cámara al código de barras del producto
        </p>
      )}
    </ScannerModal>
  );
}

const STATUS_LABEL: Record<string, string> = { ok: 'Disponible', warn: 'Stock bajo', danger: 'Agotado' };

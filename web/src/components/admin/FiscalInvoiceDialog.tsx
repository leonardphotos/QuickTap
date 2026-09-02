import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Receipt } from 'lucide-react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { formatBase } from '@/utils/format';
import type { LiveOrder } from './LiveOrdersPanel';

/**
 * Confirmación previa a emitir una factura por la máquina fiscal del local.
 *
 * Existe porque una factura fiscal es irreversible: el RIF y el nombre quedan impresos en un
 * documento legal y un dato errado no se corrige, se anula con nota de crédito. Los campos se
 * precargan con lo que el pedido ya tenga, pero alguien tiene que confirmarlos a mano — que es
 * justo lo que evita el error de tomar los datos en silencio del pedido equivocado.
 */
export function FiscalInvoiceDialog({
  order,
  currencySymbol,
  onClose,
  onEmitted,
}: {
  order: LiveOrder;
  currencySymbol: string;
  onClose: () => void;
  onEmitted: () => void;
}) {
  const [rif, setRif] = useState(order.customerIdNumber ?? '');
  const [nombre, setNombre] = useState(order.customerName ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function emitir(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/orders/${order.id}/print-fiscal`, { rif: rif.trim(), nombre: nombre.trim() });
      onEmitted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo emitir la factura fiscal.');
    } finally {
      setEnviando(false);
    }
  }

  const yaEmitida = Boolean(order.fiscalPrintedAt);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-brand-500" /> Factura fiscal
          </DialogTitle>
        </DialogHeader>

        {yaEmitida ? (
          <div className="space-y-3">
            <p className="text-sm text-brand-950/70">
              Este pedido ya tiene factura fiscal <span className="font-semibold">{order.fiscalPrinterInvoice}</span>.
            </p>
            <p className="text-xs text-brand-950/50 font-light">
              No se puede emitir dos veces: para corregirla hay que hacer una nota de crédito.
            </p>
            <TextureButton variant="minimal" size="default" onClick={onClose}>
              Cerrar
            </TextureButton>
          </div>
        ) : (
          <form onSubmit={emitir} className="space-y-4">
            <div className="rounded-xl bg-brand-950/[0.04] px-3 py-2.5 text-sm">
              <div className="flex justify-between text-brand-950/70">
                <span>Pedido</span>
                <span className="font-medium text-brand-950">#{order.orderNumber}</span>
              </div>
              <div className="flex justify-between text-brand-950/70 mt-1">
                <span>Total a facturar</span>
                <span className="font-bold text-brand-950">{formatBase(order.totalBase, currencySymbol)}</span>
              </div>
            </div>

            <label className="block text-sm">
              <span className="text-brand-950/70">
                Cédula o RIF <span className="text-red-500">*</span>
              </span>
              <input
                value={rif}
                onChange={(e) => setRif(e.target.value)}
                placeholder="V-12345678"
                autoFocus
                required
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              <span className="mt-1 block text-[11px] font-light text-brand-950/40">
                Va impreso en la factura. Si son solo números se asume cédula venezolana (V).
              </span>
            </label>

            <label className="block text-sm">
              <span className="text-brand-950/70">
                Nombre o razón social <span className="text-red-500">*</span>
              </span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="CONSUMIDOR FINAL"
                required
                maxLength={60}
                className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
            </label>

            <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                Revisa bien los datos antes de emitir. La factura fiscal queda registrada de forma
                permanente y solo se puede corregir con una nota de crédito.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <TextureButton type="button" variant="minimal" size="default" className="!w-auto" onClick={onClose}>
                Cancelar
              </TextureButton>
              <TextureButton
                type="submit"
                variant="brand"
                size="default"
                disabled={enviando || !rif.trim() || !nombre.trim()}
                className="flex-1"
              >
                {enviando ? 'Emitiendo…' : 'Emitir factura fiscal'}
              </TextureButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DeliveryCourier } from '@/types';

interface Props {
  open: boolean;
  couriers: DeliveryCourier[];
  busy: boolean;
  onPick: (courierId: string) => void;
  onClose: () => void;
}

/** Modal "Equipo de delivery": elegir un repartidor para despachar una comanda.
 * Compartido por LiveOrdersPanel (lista y ficha de detalle) y OrderReadyToast. */
export function CourierPickerDialog({ open, couriers, busy, onPick, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Equipo de delivery</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {couriers.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              disabled={busy}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-brand-950/10 hover:bg-brand-950/[0.04] px-4 py-3 text-left transition-colors disabled:opacity-50"
            >
              <span className="font-medium text-brand-950">{c.name}</span>
              {c.whatsappPhone && <span className="text-sm text-brand-950/50">{c.whatsappPhone}</span>}
            </button>
          ))}
          <button onClick={onClose} className="w-full text-center text-sm font-medium text-brand-950/50 py-2">
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

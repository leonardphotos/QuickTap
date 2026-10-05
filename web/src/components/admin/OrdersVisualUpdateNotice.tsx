import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext.shared';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const release = 'quicktap-orders-visual-20260926';
const dismissed = new Set<string>();
/** Aviso del rediseño, una vez por usuario en este dispositivo. */
export function OrdersVisualUpdateNotice() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const key = user ? `${release}:${user.id}` : null;
  useEffect(() => {
    if (!key || dismissed.has(key)) return;
    try { if (localStorage.getItem(key)) return; } catch { /* Puede estar deshabilitado. */ }
    setOpen(true);
  }, [key]);
  function close() {
    if (key) {
      dismissed.add(key);
      try { localStorage.setItem(key, 'seen'); } catch { /* Conserva el cierre durante esta sesión. */ }
    }
    setOpen(false);
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
    <DialogContent className="max-w-xl">
      <span className="text-xs font-semibold uppercase tracking-widest text-brand-500">Novedades de QuickTap</span>
      <DialogTitle>Una nueva vista para tus pedidos</DialogTitle>
      <DialogDescription>Renovamos las pantallas para que atender y cobrar sea más cómodo, tanto en el teléfono como en horizontal.</DialogDescription>
      <ul className="space-y-3 text-sm leading-relaxed text-brand-950/80">
        <li><strong>Crear y editar:</strong> catálogo visual, categorías deslizables y productos iguales agrupados. Toca un producto o despliega su grupo para editarlo.</li>
        <li><strong>Pedidos:</strong> filtros directos, estados con colores y acciones más compactas.</li>
        <li><strong>Cobros:</strong> total, abonos y saldo pendiente más claros; confirmación final compacta en horizontal.</li>
        <li><strong>Mesas:</strong> plano del salón más amplio y ventanas a pantalla completa.</li>
        <li><strong>Repartos:</strong> acceso directo, datos de entrega visibles y contadores de pedidos.</li>
      </ul>
      <p className="text-brand-950/55 text-xs">Tus pedidos y pagos se conservan. Cada usuario verá las opciones disponibles según su rol y plan.</p>
      <button type="button" onClick={close} className="min-h-11 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600">Entendido, continuar</button>
    </DialogContent>
  </Dialog>;
}

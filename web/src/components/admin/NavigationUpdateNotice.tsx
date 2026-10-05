import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext.shared';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Comparte la solicitud entre montajes de StrictMode: no consume el aviso dos veces.
const requests = new Map<string, Promise<boolean>>();
export function NavigationUpdateNotice() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    let request = requests.get(user.id);
    if (!request) {
      request = api.post('/auth/navigation-update').then(({ data }) => !!data.data.show).catch(() => false);
      requests.set(user.id, request);
    }
    request.then((show) => { if (mounted) { setOpen(show); requests.set(user.id, Promise.resolve(false)); } });
    return () => { mounted = false; };
  }, [user?.id]);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent>
      <span className="text-xs font-semibold uppercase tracking-widest text-brand-500">Novedades de QuickTap</span>
      <DialogTitle>Todo más fácil de encontrar</DialogTitle>
      <DialogDescription>Organizamos el menú sin eliminar tus funciones. Los accesos disponibles siguen dependiendo de tu rol y plan.</DialogDescription>
      <ul className="space-y-3 text-sm text-brand-950/80">
        <li><strong>Pedidos:</strong> comandas, cuentas de mesa y delivery reunidos en un mismo acceso.</li>
        <li><strong>Productos:</strong> catálogo y menú interno juntos.</li>
        <li><strong>Inventario:</strong> encuentra Casa Matriz en el selector de ubicación de Materia prima.</li>
        <li><strong>Administración:</strong> Costos y rentabilidad agrupados; reportes identificados como Rendimiento de productos y Cobros por método.</li>
        <li><strong>En tu teléfono:</strong> abre el menú para encontrar todos tus accesos.</li>
      </ul>
      <p className="text-brand-950/55 text-xs">Tu reporte semanal no ha cambiado.</p>
      <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-brand-500 px-5 py-3 font-semibold text-white">Entendido</button>
    </DialogContent>
  </Dialog>;
}

import { AnimatePresence, motion } from 'motion/react';
import { Lock, LogOut, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { ShopScreen } from './ShopLayout';

/** Misma curva del drawer de restaurantes: entra decidido, sin rebote. */
const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1];

export interface ShopDrawerItem {
  id: ShopScreen;
  label: string;
  icon: LucideIcon;
  locked?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Operación diaria: Venta, Inicio, Pedidos, Inventario, Clientes, Ajustes. */
  principales: ShopDrawerItem[];
  /** Administración, Pass, Solicitudes, Sucursales. */
  secundarios: ShopDrawerItem[];
  activo: ShopScreen;
  onNavigate: (id: ShopScreen) => void;
}

/**
 * Menú lateral del local en celular y tablet.
 *
 * Reemplaza al dock flotante de 6 iconos: ahí solo cabía la operación diaria, y todo lo demás
 * —Administración, Pass, Solicitudes, Sucursales— quedaba sin manera de abrirse desde el
 * teléfono. Acá entran TODAS las pantallas, con su nombre al lado del icono: seis siluetas sin
 * texto obligaban a adivinar cuál era cuál.
 *
 * Las pantallas de un plan superior se listan igual, con candado, y al tocarlas abren el aviso
 * de mejora — esconderlas dejaría al dueño sin saber que existen.
 */
export function ShopNavDrawer({ open, onClose, principales, secundarios, activo, onNavigate }: Props) {
  const { logout } = useAuth();

  function ir(id: ShopScreen) {
    onNavigate(id);
    onClose();
  }

  const fila = (t: ShopDrawerItem) => {
    const Icon = t.icon;
    const activa = activo === t.id;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => ir(t.id)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          activa ? 'bg-brand-950 text-white' : 'text-brand-950 hover:bg-brand-950/[0.05]'
        }`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${activa ? 'text-white' : 'text-brand-500'}`} />
        <span className={`text-sm font-medium ${t.locked && !activa ? 'opacity-60' : ''}`}>{t.label}</span>
        {t.locked && <Lock className={`ml-auto h-3.5 w-3.5 ${activa ? 'text-white/70' : 'text-brand-950/35'}`} />}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true">
          <motion.button
            className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm"
            aria-label="Cerrar menú"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: EASE_DRAWER }}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-brand-950">Menú</p>
              <button onClick={onClose} aria-label="Cerrar">
                <X className="h-5 w-5 text-brand-950/50" />
              </button>
            </div>

            <div className="flex-1 space-y-1">
              {principales.map(fila)}

              {secundarios.length > 0 && (
                <>
                  <div className="my-3 border-t border-brand-950/[0.08]" />
                  {secundarios.map(fila)}
                </>
              )}
            </div>

            <div className="space-y-1 border-t border-brand-950/10 pt-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  logout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

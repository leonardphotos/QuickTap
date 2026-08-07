import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, LogOut, Nfc, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { QrNfcQuoteDialog } from './QrNfcQuoteDialog';
import { visibleNavLinks } from '@/pages/admin/nav-links';

/** Curva de drawer estilo iOS (Ionic Framework): entra decidido, sin rebote. */
const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1];

/**
 * Menú desplegable con todas las opciones del panel (según rol y plan),
 * más cotizar QR NFC, actualizar plan y cerrar sesión. Se abre desde el
 * Dashboard y desde la barra flotante, así que vive en un solo lugar.
 */
export function NavMenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, restaurant, logout, switchToParent } = useAuth();
  const [showQrNfcQuote, setShowQrNfcQuote] = useState(false);

  // El diálogo de cotización se abre DESDE este menú (cerrándolo primero), así
  // que no puede depender de `open`: si no, al cerrar el menú también se
  // esconde el diálogo antes de que el usuario llegue a verlo.
  if (!restaurant) return null;

  // Las secciones del panel (Cocina, Delivery, Productos, etc.) ya viven en la
  // cuadrícula de "Accesos rápidos" del Dashboard y en la barra/dock de navegación —
  // este menú queda solo para Ajustes y lo secundario, para no duplicarlas.
  const settingsLink = visibleNavLinks(user?.role, restaurant, user?.canAccessInventory, user?.cashierFullAccess).find(
    (l) => l.to === '/admin/settings',
  );
  const isTrialing = restaurant.subscriptionStatus === 'TRIALING';

  return (
    <>
      <AnimatePresence>
      {open && (
      <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
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
          className="relative w-72 max-w-[85vw] bg-white h-full shadow-xl p-5 flex flex-col overflow-y-auto"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.3, ease: EASE_DRAWER }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold text-brand-950">Menú</p>
            <button onClick={onClose} aria-label="Cerrar">
              <X className="h-5 w-5 text-brand-950/50" />
            </button>
          </div>

          <div className="space-y-1 flex-1">
            {settingsLink && (
              <Link
                to={settingsLink.to}
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-950/[0.05] transition-colors"
              >
                <settingsLink.icon className="h-5 w-5 text-brand-500 shrink-0" />
                <span className="text-sm font-medium text-brand-950">{settingsLink.label}</span>
              </Link>
            )}

            <button
              onClick={() => {
                onClose();
                setShowQrNfcQuote(true);
              }}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-950/[0.05] transition-colors text-left"
            >
              <Nfc className="h-5 w-5 text-brand-500 shrink-0" />
              <span className="text-sm font-medium text-brand-950">Cotiza tus QR NFC</span>
            </button>

            {restaurant.parentRestaurantId && (
              <button
                onClick={() => {
                  onClose();
                  switchToParent();
                }}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-950/[0.05] transition-colors text-left"
              >
                <ArrowLeftRight className="h-5 w-5 text-brand-500 shrink-0" />
                <span className="text-sm font-medium text-brand-950">Volver a sede principal</span>
              </button>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-brand-950/10">
            <Link to="/admin/billing" onClick={onClose} className="block">
              <TextureButton variant="brand" size="sm">
                {isTrialing ? 'Activar plan' : 'Actualizar plan'}
              </TextureButton>
            </Link>
            <button
              onClick={() => {
                onClose();
                logout();
              }}
              className="w-full flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </motion.div>
      </div>
      )}
      </AnimatePresence>

      {showQrNfcQuote && <QrNfcQuoteDialog onClose={() => setShowQrNfcQuote(false)} />}
    </>
  );
}

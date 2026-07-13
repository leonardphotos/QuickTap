import { useState } from 'react';
import {
  ChefHat,
  Grid2x2,
  LayoutDashboard,
  Palette,
  QrCode,
  Rocket,
  Share2,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

interface Step {
  icon: typeof Sparkles;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: '¡Bienvenido a QuickTap!',
    text: 'Tu restaurante ya está listo. Este tutorial rápido te muestra cada parte del panel para que le saques el máximo provecho desde el primer día.',
  },
  {
    icon: LayoutDashboard,
    title: 'Tu Dashboard',
    text: 'Esta pantalla principal te lleva a cada sección con un toque. Arriba a la izquierda, el ícono de casita siempre te trae de vuelta aquí; a la derecha, el de ajustes abre la configuración de tu local.',
  },
  {
    icon: ChefHat,
    title: 'Cocina',
    text: 'La cola de comandas en tiempo real: cada pedido de mesa llega al instante. Marca "Listo" cuando el plato salga, o cambia el estado manualmente si lo necesitas.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Productos',
    text: 'Crea categorías y productos con foto, precio y descripción. Marca los que sean Estrella, Promoción o Recomendación de la Casa para destacarlos arriba del menú público.',
  },
  {
    icon: QrCode,
    title: 'Mesas / QR',
    text: 'Crea tus mesas (agrúpalas por zona si quieres) y descarga el código QR de cada una. Cada QR abre el menú directo en esa mesa, sin apps ni descargas.',
  },
  {
    icon: Grid2x2,
    title: 'Órdenes de Mesa',
    text: 'El plano de tus mesas en vivo: verde significa cuenta abierta. Toca una mesa para ver sus pedidos, cerrarla o rodarla a otra. Un ícono amarillo avisa que llamaron al mesero; uno verde, que pidieron la cuenta — tócalo para atenderlo.',
  },
  {
    icon: Palette,
    title: 'Apariencia y redes sociales',
    text: 'Desde Ajustes personalizas los colores del menú público y el color del banner, y agregas tus redes sociales para que aparezcan junto al logo de tu local.',
  },
  {
    icon: Users,
    title: 'Equipo',
    text: 'Crea cuentas para tu personal (Mesero, Cocina, Cajero, Pantalla) desde Ajustes → Equipo. Cada rol ve solo lo que necesita: un mesero, por ejemplo, solo ve Cocina y Órdenes de Mesa.',
  },
  {
    icon: Share2,
    title: 'Tu menú público',
    text: 'Comparte el enlace de tu menú (botón en el Dashboard) para pedidos por WhatsApp, o usa los QR de mesa. Tus clientes también pueden "Llamar al mesonero" o "Pedir la cuenta" con un toque desde ahí.',
  },
  {
    icon: Wallet,
    title: 'Planes y facturación',
    text: 'Tienes 15 días de prueba gratis con todo incluido. Verás un aviso unos días antes de que venza; desde ahí (o en Ajustes → Facturación) eliges tu plan, pagas y subes el comprobante.',
  },
  {
    icon: Rocket,
    title: '¡Listo para empezar!',
    text: 'Ya conoces todo el panel. El siguiente paso es agregar tu primer producto y crear tus mesas para generar los QR.',
  },
];

const STORAGE_PREFIX = 'quicktap_tutorial_seen_';

export function hasSeenOnboardingTutorial(restaurantId: string): boolean {
  return localStorage.getItem(STORAGE_PREFIX + restaurantId) === 'true';
}

function markOnboardingTutorialSeen(restaurantId: string): void {
  localStorage.setItem(STORAGE_PREFIX + restaurantId, 'true');
}

export function OnboardingTutorial({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  function finish() {
    markOnboardingTutorialSeen(restaurantId);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && finish()}>
      <DialogContent className="max-w-md text-center">
        <button
          onClick={finish}
          className="absolute left-4 top-4 text-xs font-medium text-brand-950/40 hover:text-brand-950"
        >
          Saltar tutorial
        </button>

        <div className="pt-6 flex flex-col items-center">
          <div className="h-14 w-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
            <current.icon className="h-7 w-7 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-brand-950">{current.title}</h2>
          <p className="text-sm text-brand-950/60 font-light mt-2 leading-relaxed">{current.text}</p>

          <div className="flex items-center gap-1.5 mt-6">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-5 bg-brand-500' : 'w-1.5 bg-brand-950/15'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 mt-6 w-full">
            {step > 0 && (
              <TextureButton variant="minimal" size="default" onClick={() => setStep((s) => s - 1)}>
                Atrás
              </TextureButton>
            )}
            <TextureButton variant="brand" size="default" onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
              {isLast ? 'Comenzar' : 'Siguiente'}
            </TextureButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

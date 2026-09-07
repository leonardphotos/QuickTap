import { Download, Printer } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import {
  TextureCard,
  TextureCardHeader,
  TextureCardTitle,
  TextureCardContent,
  TextureCardDescription,
} from '@/components/ui/texture-card';

/** Descarga la Estación de Impresión: la app de escritorio (separada del panel web) que
 * escucha las comandas en tiempo real y las manda a imprimir en la ticketera de la caja. */
export function PrintStationSection() {
  return (
    <TextureCard className="hidden lg:block">
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0 flex items-center gap-2">
          <Printer className="h-4 w-4" /> Estación de Impresión
        </TextureCardTitle>
        <TextureCardDescription className="pl-0">
          Un programa aparte para la computadora de la caja: recibe las comandas apenas entran y las manda a
          imprimir en la ticketera, sin depender de este panel.
        </TextureCardDescription>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <TextureButton variant="secondary" size="sm" className="!w-auto" asChild>
          <a href="/descargas/QuickTap-Impresion-Setup.exe" download className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5 shrink-0" /> Descargar Estación de Impresión
          </a>
        </TextureButton>

        <div className="text-sm bg-brand-950/[0.03] rounded-lg p-3 space-y-1.5">
          <p className="font-medium text-brand-950/80">Cómo instalarla en la computadora de la caja:</p>
          <ol className="list-decimal list-inside space-y-1 text-brand-950/60 font-light">
            <li>
              Windows: abre <span className="font-medium">QuickTap-Impresion-Setup.exe</span> e instala la aplicación.
              Ábrela luego desde el acceso directo de QuickTap en el Escritorio.
            </li>
            <li>Conéctate una vez con el correo y contraseña del restaurante — queda guardado para la próxima.</li>
            <li>
              Si solo tienes una ticketera en esa computadora, déjala como{' '}
              <span className="font-medium">impresora predeterminada</span> del sistema (Windows: Configuración →
              Impresoras; Mac: Preferencias del Sistema → Impresoras) y listo — todo se imprime ahí solo, sin ningún
              diálogo de "Imprimir" en pantalla.
            </li>
            <li>
              Si tienes varias ticketeras conectadas (una por cocina, y otra en caja), entra a{' '}
              <span className="font-medium">⚙️ Configuración → Impresoras</span> dentro de la app, conecta cada una y
              asígnale su cocina o "Caja" — cada comanda sale sola en la impresora correcta, y las notas de entrega de
              caja incluyen el texto "Factura no fiscal".
            </li>
          </ol>
        </div>
        <p className="text-xs text-brand-950/40 font-light">
          Si ya la tenías instalada, instala esta versión 1.9.0: incluye el acceso a la impresora fiscal en Windows.
        </p>
      </TextureCardContent>
    </TextureCard>
  );
}

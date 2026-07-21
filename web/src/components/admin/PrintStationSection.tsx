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
          <a href="/downloads/estacion-de-impresion.zip" download className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5 shrink-0" /> Descargar Estación de Impresión
          </a>
        </TextureButton>

        <div className="text-sm bg-brand-950/[0.03] rounded-lg p-3 space-y-1.5">
          <p className="font-medium text-brand-950/80">Cómo instalarla en la computadora de la caja:</p>
          <ol className="list-decimal list-inside space-y-1 text-brand-950/60 font-light">
            <li>Descarga el .zip y descomprímelo — adentro hay una carpeta "win" y otra "dmg".</li>
            <li>
              Windows: copia la carpeta <span className="font-medium">"win"</span> a esa computadora y haz doble
              clic en <span className="font-medium">"Iniciar QuickTap (Windows).bat"</span>. La primera vez crea un
              acceso directo con el ícono de QuickTap en el Escritorio.
            </li>
            <li>
              Mac: copia la carpeta <span className="font-medium">"dmg"</span> a esa computadora y arrastra{' '}
              <span className="font-medium">"QuickTap - Estacion de Impresion.app"</span> al Dock o a Aplicaciones.
              La primera vez, clic derecho → Abrir (para saltar el aviso de "desarrollador no identificado").
            </li>
            <li>Conéctate una vez con el correo y contraseña del restaurante — queda guardado para la próxima.</li>
          </ol>
        </div>
      </TextureCardContent>
    </TextureCard>
  );
}

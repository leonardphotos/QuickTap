import { Download } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import {
  TextureCard,
  TextureCardHeader,
  TextureCardTitle,
  TextureCardContent,
  TextureCardDescription,
} from '@/components/ui/texture-card';
import { useAuth } from '@/context/AuthContext';

/** Genera un acceso directo de escritorio (.url en Windows, .webloc en Mac) que abre el
 * panel de QuickTap con un doble clic. Solo tiene sentido en computadora, por eso la
 * tarjeta entera queda oculta en celular/tablet vertical. */
export function DesktopShortcutSection() {
  const { restaurant } = useAuth();

  function downloadShortcut() {
    const url = `${window.location.origin}/admin`;
    const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent) && !/iPhone|iPad|iPod/i.test(navigator.userAgent);
    const safeName = (restaurant?.name ? `QuickTap - ${restaurant.name}` : 'QuickTap').replace(/[\\/:*?"<>|]/g, '').trim();

    const content = isMac
      ? `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${url}</string>\n</dict>\n</plist>\n`
      : `[InternetShortcut]\nURL=${url}\n`;
    const filename = isMac ? `${safeName}.webloc` : `${safeName}.url`;

    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <TextureCard className="hidden lg:block">
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Acceso directo de escritorio</TextureCardTitle>
        <TextureCardDescription className="pl-0">
          Descarga un acceso directo para abrir el panel de QuickTap desde tu escritorio, sin escribir la dirección
          cada vez.
        </TextureCardDescription>
      </TextureCardHeader>
      <TextureCardContent>
        <TextureButton
          variant="secondary"
          size="sm"
          className="!w-auto flex items-center gap-1.5"
          onClick={downloadShortcut}
        >
          <Download className="h-3.5 w-3.5" /> Descargar acceso directo
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}

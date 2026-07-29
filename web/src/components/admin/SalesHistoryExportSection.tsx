import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import {
  TextureCard,
  TextureCardHeader,
  TextureCardTitle,
  TextureCardContent,
  TextureCardDescription,
} from '@/components/ui/texture-card';
import { useAuth } from '@/context/AuthContext';

/**
 * Descarga en Excel todo el historial de cobros del negocio: un renglón por
 * cada pago con fecha, hora, método, número de referencia y el monto en la
 * moneda en que se cobró. Es el respaldo completo de la información del
 * restaurante/local, para llevárselo a contabilidad o guardarlo aparte.
 */
export function SalesHistoryExportSection() {
  const { restaurant } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await api.get('/orders/export/sales-history', { responseType: 'blob' });
      const safeName = (restaurant?.name ?? 'QuickTap').replace(/[\\/:*?"<>|]/g, '').trim();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      link.download = `Historial de ventas - ${safeName}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Historial de ventas</TextureCardTitle>
        <TextureCardDescription className="pl-0">
          Descarga un Excel con todos tus cobros desde el primer día: fecha, hora, método de pago, número de
          referencia y el monto en Bs o en $ según cómo se pagó. Es el respaldo completo de la información de tu
          negocio.
        </TextureCardDescription>
      </TextureCardHeader>
      <TextureCardContent className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton
          variant="minimal"
          size="default"
          onClick={download}
          disabled={downloading}
          className="!w-auto disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {downloading ? 'Generando…' : 'Descargar historial de ventas'}
          </span>
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}

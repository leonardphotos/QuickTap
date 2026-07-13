import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { TableItem } from '../types';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9\-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'mesa';
}

/**
 * Renderiza el QR de cada mesa fuera de pantalla, lo convierte a PNG y
 * empaqueta todo en un .zip descargable (un archivo por mesa, con su nombre).
 */
export async function downloadAllTableQrCodes(tables: TableItem[], slug: string) {
  if (tables.length === 0) return;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  const root = createRoot(container);
  const origin = window.location.origin;

  root.render(
    createElement(
      'div',
      null,
      tables.map((t) =>
        createElement(QRCodeCanvas, {
          key: t.id,
          id: `qr-zip-${t.id}`,
          value: `${origin}/r/${slug}?mesa=${t.qrToken}`,
          size: 512,
          level: 'M',
          marginSize: 2,
        }),
      ),
    ),
  );

  // Espera a que React pinte los <canvas> antes de leerlos.
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const table of tables) {
      const canvas = container.querySelector<HTMLCanvasElement>(`#qr-zip-${table.id}`);
      if (!canvas) continue;

      const zoneName = table.zone?.name ? `${sanitizeFilename(table.zone.name)}-` : '';
      let filename = `${zoneName}mesa-${sanitizeFilename(table.number)}.png`;
      let i = 2;
      while (usedNames.has(filename)) {
        filename = `${zoneName}mesa-${sanitizeFilename(table.number)}-${i}.png`;
        i += 1;
      }
      usedNames.add(filename);

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) zip.file(filename, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `qr-mesas-${slug}.zip`);
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { QRCodeCanvas } from 'qrcode.react';
import type { RawShopTicket } from './shopApi';

/**
 * Genera la imagen descargable de una entrada de evento, para mandarla desde el panel una vez
 * verificado el pago (venta del POS, o pedido de la tienda ya confirmado) — QuickTap no puede
 * firmar un pase de Apple Wallet sin certificados de una cuenta de desarrollador de Apple, así
 * que esto es lo que sí se puede dar hoy: una imagen que se descarga y se manda por WhatsApp a
 * mano, como cualquier foto.
 *
 * El QR y el logo del negocio NO se capturan como parte del DOM: html2canvas pierde en silencio
 * cualquier imagen dentro de una entrada de varias secciones (comprobado — mismo hallazgo que
 * ClubTicketPage). Se capturan por separado (un <canvas> propio para el QR, un <img> cargado a
 * mano para el logo) y se pegan encima con Canvas 2D después de capturar el resto.
 *
 * Tampoco puede llevar clases de Tailwind con opacidad (`text-white/70`, `bg-black/20`…): esas
 * compilan a `color-mix(in oklab, …)`, que html2canvas no sabe parsear y revienta la captura
 * entera apenas toca la primera. Por eso esta entrada es toda `style` inline con colores planos,
 * nunca las clases vivas del resto del panel.
 */

function money(n: number) {
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaLarga(iso: string | null) {
  if (!iso) return 'Fecha por confirmar';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function useTicketDownload(negocio: { name: string; logoUrl?: string | null }) {
  const [preparando, setPreparando] = useState<RawShopTicket | null>(null);
  const [descargando, setDescargando] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);
  const qrBoxRef = useRef<HTMLDivElement>(null);
  const logoBoxRef = useRef<HTMLDivElement>(null);
  const qrSourceRef = useRef<HTMLCanvasElement>(null);

  async function descargar(ticket: RawShopTicket) {
    setDescargando(true);
    setPreparando(ticket);
    try {
      // Doble rAF: dos vueltas de pintado alcanzan para que el DOM offscreen (recién montado
      // por el `setPreparando` de arriba) y el <canvas> del QR ya tengan contenido real antes
      // de que html2canvas y toDataURL() lean sobre ellos.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const ticketEl = ticketRef.current;
      const qrBoxEl = qrBoxRef.current;
      const qrCanvas = qrSourceRef.current;
      if (!ticketEl || !qrBoxEl || !qrCanvas) return;

      const scale = 2;
      const canvas = await html2canvas(ticketEl, { scale, backgroundColor: '#ffffff' });
      const ctx = canvas.getContext('2d');
      // html2canvas deja el translate gigante del `left: -9999px` todavía activo en el
      // contexto: sin resetearlo, cualquier imagen que se pegue encima con coordenadas
      // "normales" del elemento cae miles de píxeles fuera del canvas.
      ctx?.setTransform(1, 0, 0, 1, 0, 0);
      const ticketRect = ticketEl.getBoundingClientRect();

      const paste = (img: CanvasImageSource, box: HTMLDivElement) => {
        const boxRect = box.getBoundingClientRect();
        ctx?.drawImage(
          img,
          (boxRect.left - ticketRect.left) * scale,
          (boxRect.top - ticketRect.top) * scale,
          boxRect.width * scale,
          boxRect.height * scale,
        );
      };
      const loadImage = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
          img.src = src;
        });

      paste(qrCanvas, qrBoxEl);
      if (negocio.logoUrl && logoBoxRef.current) {
        paste(await loadImage(negocio.logoUrl), logoBoxRef.current);
      }

      const slug = negocio.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 0.92);
      link.download = `entrada-${slug || 'evento'}-puesto-${ticket.seatNumber}.jpg`;
      link.click();
    } finally {
      setDescargando(false);
      setPreparando(null);
    }
  }

  const rig = preparando ? (
    <div className="pointer-events-none fixed left-[-9999px] top-0" aria-hidden>
      <QRCodeCanvas ref={qrSourceRef} value={preparando.accessToken} size={336} fgColor="#001B43" />
      <div ref={ticketRef} style={{ width: 380, backgroundColor: '#ffffff', color: '#18181b', fontFamily: 'inherit' }}>
        <div
          style={{
            background: 'linear-gradient(135deg, #009aff 0%, #056CF2 55%, #001b43 100%)',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
          className="px-6 py-7 text-center text-white"
        >
          {negocio.logoUrl && (
            <div
              ref={logoBoxRef}
              style={{ width: 48, height: 48, backgroundColor: 'rgba(255,255,255,0.2)' }}
              className="mx-auto mb-3 rounded-2xl"
            />
          )}
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#cfe6ff' }}>
            Entrada
          </p>
          <p className="mt-1 text-[19px] font-bold leading-tight">{preparando.eventName}</p>
          <p className="mt-0.5 text-[13px] font-light" style={{ color: '#d6e9ff' }}>
            {negocio.name}
          </p>
        </div>

        <div style={{ borderBottom: '1px solid #e4e4e7' }} className="grid grid-cols-2 gap-y-3 p-6">
          <DownloadDato etiqueta="Fecha" valor={fechaLarga(preparando.eventDate)} capitalize />
          <DownloadDato etiqueta="Hora" valor={preparando.eventTime ?? '—'} />
          <DownloadDato etiqueta="Titular" valor={preparando.holderName ?? 'Sin nombre'} />
          <DownloadDato etiqueta="Puesto" valor={`#${preparando.seatNumber}`} />
          <DownloadDato etiqueta="Precio" valor={money(preparando.price)} />
        </div>

        <div className="flex flex-col items-center px-6 py-7">
          <div style={{ border: '1px solid #e4e4e7' }} className="rounded-3xl bg-white p-4">
            <div ref={qrBoxRef} style={{ width: 168, height: 168 }} />
          </div>
          <p style={{ color: '#71717a' }} className="mt-3 text-center text-[12px]">
            Muestra este código en la entrada. Sirve una sola vez.
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return { rig, descargar, descargando };
}

function DownloadDato({ etiqueta, valor, capitalize }: { etiqueta: string; valor: string; capitalize?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a1a1aa' }}>
        {etiqueta}
      </p>
      <p className={`mt-0.5 text-[13.5px] font-semibold leading-snug ${capitalize ? 'capitalize' : ''}`}>{valor}</p>
    </div>
  );
}

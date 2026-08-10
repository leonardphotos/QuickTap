import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Download } from 'lucide-react';
import { api } from '@/api/client';
import { clubGradient, hhmmOf, useClubTextColor, type PublicClub } from './clubPublic';

interface Ticket {
  playerName: string;
  playerPhone: string;
  playerCount: number;
  totalBase: string;
  totalBs: string;
  status: string;
  accessToken: string;
  checkedInAt: string | null;
  requestedExtras: { id: string; name: string; quantity: number }[] | null;
  block: { startsAt: string; endsAt: string; court: { name: string; courtType: 'LIBRE' | 'TECHADA' | 'INDOOR' } };
  restaurant: { name: string; slug: string; logoUrl: string | null; theme: PublicClub['theme'] };
}

/**
 * El "ticket" del jugador: su QR de acceso. El token no codifica datos de la
 * reserva, solo identifica — el servidor resuelve y valida al escanear.
 */
export default function ClubTicketPage() {
  const { accessToken = '' } = useParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // PNG del QR ya "quemado" en una imagen, para la entrada descargable — ver por qué en DownloadableTicket.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const qrBoxRef = useRef<HTMLDivElement>(null);
  const logoBoxRef = useRef<HTMLDivElement>(null);
  const qrSourceRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api
      .get(`/public/club/bookings/token/${accessToken}`)
      .then((r) => setTicket(r.data.data))
      .catch(() => setError(true));
  }, [accessToken]);

  // Se dispara apenas el canvas fuente termina de dibujar el QR (ver su propio comentario).
  useEffect(() => {
    if (!ticket || ticket.status === 'CANCELLED' || !qrSourceRef.current) return;
    setQrDataUrl(qrSourceRef.current.toDataURL('image/png'));
  }, [ticket]);

  useClubTextColor(ticket?.restaurant.theme?.text);

  async function download() {
    if (!downloadRef.current || !qrBoxRef.current || !ticket || !qrDataUrl) return;
    setDownloading(true);
    try {
      const ticketEl = downloadRef.current;
      const qrBoxEl = qrBoxRef.current;
      const scale = 2;

      // El QR y el logo se pegan a mano con Canvas 2D en vez de vivir en el DOM
      // que captura html2canvas: esta entrada vive fuera de pantalla con
      // `left: -9999px` para no verse nunca, y html2canvas devuelve su canvas
      // con esa traslación gigante todavía activa en el contexto (no la
      // resetea después de renderizar) — cualquier imagen que uno intente
      // dibujar ahí encima, con las coordenadas "normales" del elemento,
      // termina miles de píxeles fuera del canvas. `setTransform` la limpia.
      const canvas = await html2canvas(ticketEl, { scale, backgroundColor: '#ffffff' });
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(1, 0, 0, 1, 0, 0);
      const ticketRect = ticketEl.getBoundingClientRect();

      const paste = (img: HTMLImageElement, box: HTMLDivElement) => {
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

      paste(await loadImage(qrDataUrl), qrBoxEl);
      if (ticket.restaurant.logoUrl && logoBoxRef.current) {
        paste(await loadImage(ticket.restaurant.logoUrl), logoBoxRef.current);
      }

      const slug = ticket.restaurant.slug.replace(/[^a-z0-9-]/gi, '');
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 0.92);
      link.download = `entrada-${slug}-${ticket.block.court.name}.jpg`;
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0d1b2a] px-6">
        <p className="text-center font-light text-club-text/60">No encontramos esta reserva.</p>
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0d1b2a] px-6">
        <p className="font-light text-club-text/50">Cargando…</p>
      </div>
    );
  }

  const day = new Date(ticket.block.startsAt).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Caracas',
  });
  const cancelled = ticket.status === 'CANCELLED';

  return (
    <div className="min-h-screen px-5 py-8 text-club-text" style={clubGradient(ticket.restaurant.theme)}>
      <div className="mx-auto max-w-sm">
        <div className="text-center">
          {ticket.restaurant.logoUrl && (
            <img
              src={ticket.restaurant.logoUrl}
              alt=""
              className="mx-auto mb-3 h-14 w-14 rounded-2xl object-cover ring-1 ring-white/30"
            />
          )}
          <p className="text-[17px] font-bold">{ticket.restaurant.name}</p>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-white/25 bg-white/15 backdrop-blur-xl">
          <div className="border-b border-dashed border-white/25 p-6 text-center">
            {cancelled ? (
              <p className="rounded-2xl bg-rose-500/25 py-3 text-[14px] font-bold">Reserva cancelada</p>
            ) : (
              <>
                <div className="inline-block rounded-3xl bg-white p-4 shadow-xl">
                  <QRCodeSVG value={ticket.accessToken} size={168} fgColor="#001B43" />
                </div>
                <p className="mt-3 text-[12px] font-light text-club-text/65">
                  Muestra este código en recepción al llegar.
                </p>
              </>
            )}

            {ticket.checkedInAt && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] font-bold text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Ya registraste tu entrada
              </p>
            )}
          </div>

          <div className="space-y-3 p-6">
            <Row label="Cancha" value={ticket.block.court.name} />
            <Row label="Día" value={day} capitalize />
            <Row label="Hora" value={`${hhmmOf(ticket.block.startsAt)} a ${hhmmOf(ticket.block.endsAt)}`} />
            <Row label="Jugadores" value={String(ticket.playerCount)} />
            <Row label="A nombre de" value={ticket.playerName} />

            {ticket.requestedExtras && ticket.requestedExtras.length > 0 && (
              <div className="border-t border-white/15 pt-3">
                <p className="text-[13px] font-medium text-club-text/55">Listo al llegar</p>
                <ul className="mt-1 space-y-0.5">
                  {ticket.requestedExtras.map((e) => (
                    <li key={e.id} className="text-[14px] font-semibold">
                      {e.quantity}× {e.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] font-light text-club-text/45">Se paga en el club.</p>
              </div>
            )}

            <div className="border-t border-white/15 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-club-text/55">Cancha</span>
                <span className="text-[19px] font-bold">${ticket.totalBase}</span>
              </div>
              <p className="text-right text-[12px] font-light text-club-text/45">
                Bs {Number(ticket.totalBs).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {!cancelled && (
          <button
            onClick={download}
            disabled={downloading || !qrDataUrl}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-bold text-brand-950 shadow-xl transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {downloading ? 'Generando imagen…' : 'Descargar entrada'}
          </button>
        )}

        <p className="mt-4 text-center text-[12px] font-light text-club-text/45">
          Guarda este enlace: es tu entrada a la cancha.
        </p>
      </div>

      {!cancelled && (
        <>
          {/* Fuente del QR de la entrada descargable: un canvas normal, montado
              en pantalla (aunque fuera de vista), del que se saca el PNG apenas
              termina de dibujar — ver el useEffect de arriba. */}
          <div className="pointer-events-none fixed left-[-9999px] top-0" aria-hidden>
            <QRCodeCanvas ref={qrSourceRef} value={ticket.accessToken} size={336} fgColor="#001B43" />
          </div>
          <DownloadableTicket
            ticketRef={downloadRef}
            qrBoxRef={qrBoxRef}
            logoBoxRef={logoBoxRef}
            ticket={ticket}
            day={day}
          />
        </>
      )}
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[13px] font-medium text-club-text/55">{label}</span>
      <span className={`text-right text-[14px] font-semibold ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * Versión de la entrada que sí se puede descargar: mismos datos, pero solo con
 * colores planos por style inline, nada de clases de Tailwind con opacidad
 * (bg-white/15, text-club-text/65…). Esas compilan a `color-mix(in oklab, …)`,
 * que html2canvas no sabe parsear y tira la captura entera — probado a mano,
 * revienta apenas toca la primera. Vive fuera de la pantalla (no display:none,
 * que html2canvas sí necesita el layout real) y nunca se ve; solo se captura.
 *
 * El QR y el logo del club NO van acá como <img>: html2canvas pierde en
 * silencio cualquier imagen en esta entrada de varias secciones (probado con
 * canvas en vivo, <img> y background-image, ninguno funcionó). Sus cajas
 * quedan vacías — el `download()` de arriba las pega encima a mano con
 * Canvas 2D después de capturar todo lo demás.
 */
function DownloadableTicket({
  ticketRef,
  qrBoxRef,
  logoBoxRef,
  ticket,
  day,
}: {
  ticketRef: React.RefObject<HTMLDivElement | null>;
  qrBoxRef: React.RefObject<HTMLDivElement | null>;
  logoBoxRef: React.RefObject<HTMLDivElement | null>;
  ticket: Ticket;
  day: string;
}) {
  const primary = ticket.restaurant.theme?.primary || '#0B6BCB';
  const border = '1px solid #e4e4e7';

  return (
    <div className="pointer-events-none fixed left-[-9999px] top-0" aria-hidden>
      <div
        ref={ticketRef}
        style={{ width: 380, backgroundColor: '#ffffff', color: '#18181b', fontFamily: 'inherit' }}
      >
        {/* Las esquinas redondeadas van en cada banda (arriba/abajo), no en un
            overflow-hidden del contenedor entero, para no depender de eso en
            la captura. */}
        <div
          style={{ backgroundColor: primary, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
          className="px-6 py-7 text-center text-white"
        >
          {ticket.restaurant.logoUrl && (
            <div
              ref={logoBoxRef}
              style={{ width: 56, height: 56, backgroundColor: 'rgba(255,255,255,0.2)' }}
              className="mx-auto mb-3 rounded-2xl"
            />
          )}
          <p className="text-[18px] font-bold">{ticket.restaurant.name}</p>
        </div>

        <div style={{ borderBottom: border }} className="p-6 text-center">
          <div style={{ border }} className="inline-block rounded-3xl bg-white p-4">
            <div ref={qrBoxRef} style={{ width: 168, height: 168 }} />
          </div>
          <p style={{ color: '#71717a' }} className="mt-3 text-[12px]">
            Muestra este código en recepción al llegar.
          </p>
          {ticket.checkedInAt && (
            <p style={{ color: '#059669' }} className="mt-3 flex items-center justify-center gap-1.5 text-[13px] font-bold">
              <CheckCircle2 className="h-4 w-4" />
              Ya registraste tu entrada
            </p>
          )}
        </div>

        <div className="space-y-3 p-6">
          <DownloadRow label="Cancha" value={ticket.block.court.name} />
          <DownloadRow label="Día" value={day} capitalize />
          <DownloadRow label="Hora" value={`${hhmmOf(ticket.block.startsAt)} a ${hhmmOf(ticket.block.endsAt)}`} />
          <DownloadRow label="Jugadores" value={String(ticket.playerCount)} />
          <DownloadRow label="A nombre de" value={ticket.playerName} />

          {ticket.requestedExtras && ticket.requestedExtras.length > 0 && (
            <div style={{ borderTop: border }} className="pt-3">
              <p style={{ color: '#71717a' }} className="text-[13px] font-medium">
                Listo al llegar
              </p>
              <ul className="mt-1 space-y-0.5">
                {ticket.requestedExtras.map((e) => (
                  <li key={e.id} className="text-[14px] font-semibold">
                    {e.quantity}× {e.name}
                  </li>
                ))}
              </ul>
              <p style={{ color: '#a1a1aa' }} className="mt-1 text-[11px]">
                Se paga en el club.
              </p>
            </div>
          )}

          <div style={{ borderTop: border }} className="pt-3">
            <div className="flex items-baseline justify-between">
              <span style={{ color: '#71717a' }} className="text-[13px] font-medium">
                Cancha
              </span>
              <span className="text-[19px] font-bold">${ticket.totalBase}</span>
            </div>
            <p style={{ color: '#a1a1aa' }} className="text-right text-[12px]">
              Bs {Number(ticket.totalBs).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div
          style={{ backgroundColor: primary, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
          className="py-3 text-center text-[11px] font-bold uppercase tracking-wide text-white"
        >
          Entrada de reserva · QuickTap.club
        </div>
      </div>
    </div>
  );
}

function DownloadRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: '#71717a' }} className="shrink-0 text-[13px] font-medium">
        {label}
      </span>
      <span className={`text-right text-[14px] font-semibold ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

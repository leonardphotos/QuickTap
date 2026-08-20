import { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, MessageCircle } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Recibo de compra que aparece al terminar de ordenar en el menú público.
 *
 * Sustituye al salto directo a WhatsApp: antes, al confirmar el pedido el navegador se iba a
 * wa.me sin que el cliente llegara a ver qué había pedido ni cuánto era. Ahora ve el detalle
 * completo y decide él cuándo mandarlo.
 *
 * Donde un recibo llevaría el código de barras va el botón de WhatsApp: ese es el paso que
 * cierra la compra, así que ocupa el lugar de más peso visual del ticket.
 *
 * Los tiempos vienen de la especificación acordada: la tarjeta baja y se expande a los 0.2s, el
 * confeti revienta a los 0.9s, el contenido entra escalonado desde los 0.8s y el botón hace su
 * entrada de último, a los 1.2s, para que la vista termine mirándolo.
 */

export interface ReceiptLine {
  name: string;
  quantity: number;
  lineLabel: string;
}

export interface ReceiptTotal {
  label: string;
  value: string;
  strong?: boolean;
}

interface Props {
  restaurantName: string;
  logoUrl?: string | null;
  orderNumber: number | string;
  modeLabel: string;
  customerName: string;
  paymentLabel: string;
  lines: ReceiptLine[];
  totals: ReceiptTotal[];
  whatsappUrl: string;
  onSent: () => void;
}

/**
 * Una sola paleta: el color del restaurante (que MenuPage vuelca en --color-brand-*), verde
 * para el "listo" y neutros para el papel. Antes el recibo traía su propio azul fijo, así que
 * en un local rojo convivían cuatro familias de color a la vez.
 *
 * El confeti se lee del tema en tiempo de ejecución porque el canvas no entiende variables CSS.
 */
function paletaDelRestaurante(): string[] {
  if (typeof window === 'undefined') return [GREEN];
  const cs = getComputedStyle(document.documentElement);
  const marca = cs.getPropertyValue('--color-brand-500').trim();
  const acento = cs.getPropertyValue('--color-brand-400').trim();
  return [marca || GREEN, acento || marca || GREEN, GREEN].filter(Boolean);
}
const CONFETTI_COUNT = 60;
const CONFETTI_AT = 0.9;
/** El ticket entero se descubre con un solo barrido de arriba hacia abajo, así que ya no hay
 * entradas escalonadas por elemento: el botón aparece al final del barrido, por estar al final
 * del papel, no por un retardo propio. */
const REVEAL_AT = 0.2;
const REVEAL_DURATION = 1.1;

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Paleta del recibo. El datáfono toma el color de los botones del restaurante
 * (--color-brand-500/400, que MenuPage define desde el tema de cada negocio), así el recibo se
 * ve del local y no de QuickTap. El check va en verde porque es el "listo", no la marca. */
const GREEN = '#22c55e';
/** Tinta y grises salen del color de texto del tema, no de un azul propio. */
const INK = 'var(--color-brand-950, #1a1a1a)';
const MUTED = 'color-mix(in srgb, var(--color-brand-950, #1a1a1a) 55%, transparent)';
const DASH = 'color-mix(in srgb, var(--color-brand-950, #1a1a1a) 15%, transparent)';

/**
 * Confeti en canvas y no en DOM: son 60 partículas animándose a la vez y cada una como nodo
 * obligaría al navegador a recalcular estilos 60 veces por cuadro.
 */
function Confetti({ delaySeconds }: { delaySeconds: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const colores = paletaDelRestaurante();
    const particles = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      // Abanico de 180° hacia arriba, como el spread de la especificación.
      const angle = Math.PI + (Math.PI * i) / (CONFETTI_COUNT - 1);
      const speed = 4 + Math.random() * 5;
      return {
        x: width / 2,
        y: 120,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 5,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: colores[i % colores.length],
      };
    });

    let raf = 0;
    let start = 0;
    const GRAVITY = 0.6;
    const FADE_OUT = 1;
    const LIFE = 2;

    function frame(now: number) {
      if (!start) start = now;
      const elapsed = (now - start) / 1000;
      ctx!.clearRect(0, 0, width, height);

      // Se desvanece al final, no de golpe.
      const alpha = elapsed > LIFE - FADE_OUT ? Math.max(0, (LIFE - elapsed) / FADE_OUT) : 1;
      ctx!.globalAlpha = alpha;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY;
        p.rotation += p.spin;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx!.restore();
      }

      if (elapsed < LIFE) raf = requestAnimationFrame(frame);
      else ctx!.clearRect(0, 0, width, height);
    }

    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(frame);
    }, delaySeconds * 1000);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [delaySeconds]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // z-30 y a toda la altura: cae por encima del datáfono y de la comanda entera, no solo
      // sobre la franja de arriba. pointer-events-none para que no bloquee el botón que tapa.
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
    />
  );
}

/**
 * Fila etiqueta/valor del ticket.
 *
 * Tres tamaños a propósito: los datos administrativos (pedido, fecha, tipo, cliente) y los
 * cargos (subtotal, servicio, IVA) van pequeños porque se consultan, no se leen; lo que el
 * cliente pidió conserva el tamaño normal porque es lo que viene a verificar; y el total va
 * grande porque es la cifra que importa de un vistazo.
 *
 * No lleva animación propia: el ticket entero se descubre de arriba hacia abajo con el
 * clip-path del contenedor, así que animar cada fila aparte rompía ese barrido.
 */
function Row({ label, value, size }: { label: string; value: string; size: 'meta' | 'item' | 'total' }) {
  const labelClass =
    size === 'total' ? 'text-[15px] font-bold' : size === 'item' ? 'text-[12.5px]' : 'text-[9px]';
  const valueClass =
    size === 'total'
      ? 'text-[16px] font-bold'
      : size === 'item'
        ? 'text-[12.5px] font-semibold'
        : 'text-[9px] font-semibold';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={labelClass} style={{ color: size === 'total' ? INK : MUTED }}>
        {label}
      </span>
      <span className={valueClass} style={{ color: INK }}>
        {value}
      </span>
    </div>
  );
}

export function OrderReceipt(props: Props) {
  const reduceMotion = useReducedMotion();

  /** Con "menos movimiento" activado se ve el resultado, no el recorrido. */
  const t = useMemo(() => (seconds: number) => (reduceMotion ? 0 : seconds), [reduceMotion]);

  const rows: { label: string; value: string; size: 'meta' | 'item' | 'total' }[] = [
    { label: 'Pedido', value: `#${props.orderNumber}`, size: 'meta' },
    {
      label: 'Fecha',
      value: new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }),
      size: 'meta',
    },
    { label: 'Tipo', value: props.modeLabel, size: 'meta' },
    ...(props.customerName ? [{ label: 'Cliente', value: props.customerName, size: 'meta' as const }] : []),
    // Lo que pidió: el único bloque que conserva el tamaño normal.
    ...props.lines.map((l) => ({ label: `${l.quantity}× ${l.name}`, value: l.lineLabel, size: 'item' as const })),
    ...props.totals.map((t) => ({ label: t.label, value: t.value, size: (t.strong ? 'total' : 'meta') as 'total' | 'meta' })),
  ];

  return (
    <div
      className="relative -mx-6 -mb-2 -mt-2 px-4 pb-4 pt-3 text-center"
      style={{ background: 'linear-gradient(180deg, #f2f4f6 0%, #f7f9fa 45%, #fbfcfd 100%)' }}
    >
      {!reduceMotion && <Confetti delaySeconds={CONFETTI_AT} />}

      {/* Datáfono: la ranura por donde "sale" el recibo, en el color de los botones del
          restaurante para que el comprobante se lea como del local. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: t(0.35), ease: EASE_OUT_EXPO }}
        className="relative z-20 w-full rounded-[26px] px-3 pb-4 pt-3 shadow-[0_16px_34px_-18px_rgba(0,0,0,0.35)]"
        style={{
          // Un solo color, el primario del local, con un oscurecido abajo para dar volumen. Antes
          // degradaba del acento al primario y esos dos tonos competían con el resto del ticket.
          background:
            'linear-gradient(180deg, var(--color-brand-500) 0%, color-mix(in srgb, var(--color-brand-500) 82%, black) 100%)',
        }}
      >
        <div className="flex h-[54px] items-center justify-center rounded-[16px] bg-[#1f2937]">
          <span className="h-[5px] w-[80%] rounded-full bg-black/80" />
        </div>
      </motion.div>

      {/* El ticket se revela de arriba hacia abajo, como el papel saliendo de la ranura.
          Se recorta con clip-path en vez de animar la altura: el contenedor del drawer mide su
          alto al abrirse, y creciendo desde 0 lo medía vacío y el recibo quedaba cortado. Con
          clip-path el alto es el final desde el primer cuadro y solo cambia lo que se ve. */}
      <motion.div
        initial={{ clipPath: 'inset(0 0 100% 0)', opacity: 0 }}
        animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }}
        transition={{ delay: t(REVEAL_AT), duration: t(REVEAL_DURATION), ease: EASE_OUT_EXPO }}
        className="relative z-0 -mt-4 rounded-b-[22px] rounded-t-[10px] bg-white shadow-[0_18px_44px_-26px_rgba(20,80,110,0.45)]"
      >
        <div className="px-5 pb-8 pt-8 text-left">
        <div className="text-center">
          <span
            className="mx-auto flex h-[62px] w-[62px] items-center justify-center rounded-full"
            style={{ background: GREEN, boxShadow: '0 0 0 10px rgba(34,197,94,0.16)' }}
          >
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </span>
          <p
            className="mt-4 text-[12px] font-semibold uppercase"
            style={{ color: GREEN, letterSpacing: '0.22em' }}
          >
            Pedido confirmado
          </p>
          <p className="mt-1 text-[30px] font-extrabold leading-tight" style={{ color: INK }}>
            ¡Gracias!
          </p>
        </div>

        <div className="my-4 border-t border-dashed" style={{ borderColor: DASH }} />

        <div className="space-y-[6px]">
          {rows.map((row, i) => (
            <Row key={`${row.label}-${i}`} label={row.label} value={row.value} size={row.size} />
          ))}
        </div>

        <div className="my-4 border-t border-dashed" style={{ borderColor: DASH }} />

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[9px]" style={{ color: MUTED }}>
            Método de pago
          </span>
          <span className="text-[9px] font-semibold" style={{ color: INK }}>
            {props.paymentLabel}
          </span>
        </div>

        {/* En un recibo aquí iría el código de barras. Acá va lo que cierra la compra. */}
        <div className="mt-6">
          <TextureButton
            variant="brand"
            size="default"
            className="!w-full flex items-center justify-center gap-2"
            onClick={() => {
              window.location.href = props.whatsappUrl;
              props.onSent();
            }}
          >
            <MessageCircle className="h-4 w-4" />
            Enviar por WhatsApp
          </TextureButton>
          <p className="mt-2.5 text-center text-[12.5px] font-light leading-snug" style={{ color: MUTED }}>
            Para finalizar tu compra envía tu pedido por WhatsApp
          </p>
        </div>
        </div>
      </motion.div>
    </div>
  );
}

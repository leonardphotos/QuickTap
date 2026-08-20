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

const CONFETTI_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6'];
const CONFETTI_COUNT = 60;
const CONFETTI_AT = 0.9;
const CONTENT_AT = 0.8;
const STAGGER = 0.08;
/** El botón entra de último, cuando ya se leyó el detalle. */
const ACTION_AT = 1.2;

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Paleta del recibo: azules fríos, para que se lea como un comprobante y no como el menú. */
const INK = '#12303d';
const ACCENT = '#3faccf';
const MUTED = '#5b7a8a';
const DASH = '#cfe6f0';

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
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
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
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-72 w-full"
    />
  );
}

/** Fila etiqueta/valor del ticket, con su entrada escalonada. */
function Row({
  label,
  value,
  strong,
  delay,
  reduceMotion,
}: {
  label: string;
  value: string;
  strong?: boolean;
  delay: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: reduceMotion ? 0 : 0.3, ease: EASE_OUT_EXPO }}
      className="flex items-baseline justify-between gap-3"
    >
      <span
        className={strong ? 'text-[17px] font-bold' : 'text-[15px]'}
        style={{ color: strong ? INK : MUTED }}
      >
        {label}
      </span>
      <span
        className={strong ? 'text-[19px] font-bold' : 'text-[15px] font-semibold'}
        style={{ color: INK }}
      >
        {value}
      </span>
    </motion.div>
  );
}

export function OrderReceipt(props: Props) {
  const reduceMotion = useReducedMotion();

  /** Con "menos movimiento" activado se ve el resultado, no el recorrido. */
  const t = useMemo(() => (seconds: number) => (reduceMotion ? 0 : seconds), [reduceMotion]);

  const detailRows: ReceiptTotal[] = [
    { label: 'Pedido', value: `#${props.orderNumber}` },
    { label: 'Fecha', value: new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }) },
    { label: 'Tipo', value: props.modeLabel },
    ...(props.customerName ? [{ label: 'Cliente', value: props.customerName }] : []),
  ];

  const bodyRows: ReceiptTotal[] = [
    ...detailRows,
    ...props.lines.map((l) => ({ label: `${l.quantity}× ${l.name}`, value: l.lineLabel })),
    ...props.totals,
  ];

  return (
    <div
      className="relative -mx-6 -mb-2 -mt-2 px-4 pb-4 pt-3 text-center"
      style={{ background: 'linear-gradient(180deg, #dff1fa 0%, #eaf7fc 45%, #f4fbfd 100%)' }}
    >
      {!reduceMotion && <Confetti delaySeconds={CONFETTI_AT} />}

      {/* Datáfono: la ranura por donde "sale" el recibo. La luz verde late para decir que la
          operación quedó registrada antes de que el cliente lea un solo número. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: t(0.35), ease: EASE_OUT_EXPO }}
        className="relative z-20 mx-auto w-full max-w-[290px] rounded-[26px] px-3 pb-4 pt-3 shadow-[0_16px_34px_-18px_rgba(30,120,150,0.6)]"
        style={{ background: 'linear-gradient(180deg, #8ed8ee 0%, #58bcdd 60%, #3faccf 100%)' }}
      >
        <div className="flex h-[54px] items-center justify-center rounded-[16px] bg-[#16323f]">
          <span className="h-[5px] w-[80%] rounded-full bg-black/80" />
        </div>
        <motion.span
          aria-hidden="true"
          className="absolute right-3 top-2.5 h-3 w-3 rounded-full"
          style={{ background: '#7ed957', boxShadow: '0 0 8px rgba(126,217,87,0.9)' }}
          initial={{ opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: [0.4, 1, 0.4] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { delay: t(0.1), duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      </motion.div>

      {/* El ticket baja desde detrás del datáfono y se expande. */}
      <motion.div
        initial={{ opacity: 0, y: -70, scaleY: 0.95 }}
        animate={{ opacity: 1, y: 0, scaleY: 1 }}
        transition={{ delay: t(0.2), duration: t(0.7), ease: EASE_OUT_EXPO }}
        style={{ transformOrigin: 'top center' }}
        className="relative z-0 -mt-4 rounded-b-[22px] rounded-t-[10px] bg-white px-5 pb-6 pt-8 text-left shadow-[0_18px_44px_-26px_rgba(20,80,110,0.45)]"
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: t(CONTENT_AT), duration: t(0.3) }}
          className="text-center"
        >
          <span
            className="mx-auto flex h-[62px] w-[62px] items-center justify-center rounded-full"
            style={{ background: ACCENT, boxShadow: '0 0 0 10px rgba(63,172,207,0.14)' }}
          >
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </span>
          <p
            className="mt-4 text-[12px] font-semibold uppercase"
            style={{ color: ACCENT, letterSpacing: '0.22em' }}
          >
            Pedido confirmado
          </p>
          <p className="mt-1 text-[30px] font-extrabold leading-tight" style={{ color: INK }}>
            ¡Gracias!
          </p>
          {props.logoUrl && (
            <img src={props.logoUrl} alt="" className="mx-auto mt-3 h-9 w-auto object-contain" />
          )}
          <p className="mt-1 text-[13px] font-medium" style={{ color: MUTED }}>
            {props.restaurantName}
          </p>
        </motion.div>

        <div className="my-5 border-t border-dashed" style={{ borderColor: DASH }} />

        <div className="space-y-[14px]">
          {bodyRows.map((row, i) => (
            <Row
              key={`${row.label}-${i}`}
              label={row.label}
              value={row.value}
              strong={row.strong}
              delay={t(CONTENT_AT + 0.3 + i * STAGGER)}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>

        <div className="my-5 border-t border-dashed" style={{ borderColor: DASH }} />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: t(CONTENT_AT + 0.6), duration: t(0.3) }}
          className="flex items-baseline justify-between gap-3"
        >
          <span className="text-[15px]" style={{ color: MUTED }}>
            Método de pago
          </span>
          <span className="text-[15px] font-semibold" style={{ color: INK }}>
            {props.paymentLabel}
          </span>
        </motion.div>

        {/* En un recibo aquí iría el código de barras. Acá va lo que cierra la compra. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: t(ACTION_AT), duration: t(0.4), ease: EASE_OUT_EXPO }}
          className="mt-6"
        >
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
        </motion.div>
      </motion.div>
    </div>
  );
}

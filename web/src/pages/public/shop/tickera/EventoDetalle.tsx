import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Calendar, Check, ChevronLeft, ChevronRight, Clock, MapPin, Smartphone, Ticket, Wallet } from 'lucide-react';
import { publicPriceLabel } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import type { StorefrontProduct, StorefrontShop } from '../shopStorefront';

/**
 * "Más información" de un evento y su compra, a pantalla completa.
 *
 * Los pasos van en este orden por una razón: primero se explica el evento, después se aceptan
 * las cláusulas y SOLO entonces aparece el precio y la forma de pago. Enseñar el precio antes
 * de las condiciones invita a comprar sin leerlas, que es justo lo que las cláusulas existen
 * para evitar.
 *
 * El cobro no ocurre acá: al terminar se arma el pedido como cualquier otro de la tienda y el
 * local lo confirma cuando recibe el pago (ver shop-orders.service.confirm). Lo que sí viaja
 * es la ELECCIÓN de financiar; el precio y las cuotas los recalcula el servidor.
 */

type Paso = 'info' | 'clausulas' | 'pago' | 'tutorial';

const FRECUENCIA: Record<string, string> = {
  SEMANAL: 'cada semana',
  QUINCENAL: 'cada 15 días',
  MENSUAL: 'cada mes',
};

export function EventoDetalle({
  evento,
  shop,
  onCerrar,
  onComprar,
}: {
  evento: StorefrontProduct;
  shop: StorefrontShop;
  onCerrar: () => void;
  /** Arma el pedido. `financiado` decide si la venta se cobra completa o a cuotas;
   * `cuotas` es en cuántas eligió pagar (el evento pone el techo). */
  onComprar: (financiado: boolean, cuotas: number) => void;
}) {
  const [paso, setPaso] = useState<Paso>('info');
  const [acepta, setAcepta] = useState(false);
  const [financiado, setFinanciado] = useState(false);
  const [cuotas, setCuotas] = useState(0); // 0 = todavía no eligió: arranca en el máximo
  const [imagen, setImagen] = useState(0);
  const pistaRef = useRef<HTMLDivElement>(null);

  /** Flechas y puntos: desplazan la pista y el onScroll actualiza `imagen` solo. Se recorta al
   * rango en vez de dar la vuelta — deslizando no existe "del último al primero", y que las
   * flechas hagan otra cosa que el dedo desorienta. */
  function irAImagen(i: number) {
    const el = pistaRef.current;
    if (!el) return;
    const destino = Math.max(0, Math.min(galeria.length - 1, i));
    el.scrollTo({ left: destino * el.clientWidth, behavior: 'smooth' });
  }

  const precio = publicPriceLabel(evento.price, shop);
  const fin = evento.financing;
  // El número del evento es el TECHO; el comprador elige cuántas dentro de él. Arranca en el
  // máximo porque es la cuota más pequeña — la opción que más ayuda a decidirse.
  const cuotasElegidas = fin ? (cuotas >= 2 && cuotas <= fin.installments ? cuotas : fin.installments) : 0;
  const inicial = fin ? Math.round(evento.price * (fin.downPercent / 100) * 100) / 100 : 0;
  const porCuota = fin ? Math.round(((evento.price - inicial) / cuotasElegidas) * 100) / 100 : 0;
  const galeria = evento.eventImages?.length ? evento.eventImages : evento.photoUrl ? [evento.photoUrl] : [];
  const agotado = evento.seatsLeft === 0;

  // Sin cláusulas cargadas no se inventa un paso vacío: se salta directo al precio.
  const siguienteDeInfo = () => setPaso(evento.eventTerms?.trim() ? 'clausulas' : 'pago');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0d12] text-white">
      <div className="mx-auto min-h-dvh w-full max-w-lg pb-10">
        {/* Cabecera */}
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-[#0b0d12]/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => (paso === 'info' ? onCerrar() : setPaso(paso === 'tutorial' ? 'pago' : paso === 'pago' ? (evento.eventTerms?.trim() ? 'clausulas' : 'info') : 'info'))}
            aria-label="Volver"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] transition-colors hover:bg-white/15"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{evento.name}</p>
          {shop.logoUrl && <img src={shop.logoUrl} alt="" className="h-7 w-7 rounded-lg object-cover" />}
        </div>

        <AnimatePresence mode="wait">
          {paso === 'info' && (
            <motion.div
              key="info"
              initial={{ opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="px-4"
            >
              {/* Carrusel de la galería. Antes cambiaba la imagen con setImagen y solo
                  funcionaban las flechas: en el teléfono el gesto natural es deslizar, y no
                  había nada que deslizar. Ahora es una pista horizontal real con scroll-snap
                  del navegador — el arrastre trae su propia inercia y frenado nativos, cosa
                  que un onTouchMove hecho a mano nunca iguala. Las flechas y los puntos
                  siguen ahí (desktop no desliza) y solo llaman a scrollTo; `imagen` pasa de
                  mandar a solo escuchar el scroll, para pintar los puntos. */}
              {galeria.length > 0 && (
                <div className="relative overflow-hidden rounded-3xl bg-white/[0.04]">
                  <div
                    ref={pistaRef}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      setImagen(Math.round(el.scrollLeft / el.clientWidth));
                    }}
                    className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {galeria.map((src, i) => (
                      <img key={i} src={src} alt="" className="aspect-[4/5] w-full shrink-0 snap-center object-cover" />
                    ))}
                  </div>
                  {galeria.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Anterior"
                        onClick={() => irAImagen(imagen - 1)}
                        className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur transition-colors hover:bg-black/70"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Siguiente"
                        onClick={() => irAImagen(imagen + 1)}
                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur transition-colors hover:bg-black/70"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                        {galeria.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            aria-label={`Ver ${i + 1}`}
                            onClick={() => irAImagen(i)}
                            className={`h-1.5 rounded-full transition-all duration-300 ${i === imagen ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <h1 className="mt-5 text-[26px] font-black leading-tight">{evento.name}</h1>

              <div className="mt-3 space-y-2">
                {evento.eventDate && (
                  <Fila icono={Calendar} texto={new Date(`${evento.eventDate}T00:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} />
                )}
                {evento.eventTime && <Fila icono={Clock} texto={evento.eventTime} />}
                {evento.location && <Fila icono={MapPin} texto={evento.location} />}
                {evento.seatsLeft != null && (
                  <Fila icono={Ticket} texto={agotado ? 'Sin puestos disponibles' : `${evento.seatsLeft} puestos disponibles`} />
                )}
              </div>

              {evento.eventDescription && (
                <p className="mt-5 whitespace-pre-line text-[14px] font-light leading-relaxed text-white/70">
                  {evento.eventDescription}
                </p>
              )}

              <TextureButton
                variant="brand"
                size="default"
                disabled={agotado}
                className="mt-7 disabled:opacity-40"
                onClick={siguienteDeInfo}
              >
                {agotado ? 'Agotado' : 'Pagar'}
              </TextureButton>
            </motion.div>
          )}

          {paso === 'clausulas' && (
            <motion.div
              key="clausulas"
              initial={{ opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="px-4"
            >
              <h2 className="mt-2 text-[20px] font-bold">Antes de continuar</h2>
              <p className="mt-1 text-[12.5px] font-light text-white/50">
                Lee las condiciones de esta entrada. Tienes que aceptarlas para poder pagar.
              </p>
              <div className="mt-4 max-h-[46dvh] overflow-y-auto rounded-2xl bg-white/[0.05] p-4 text-[13px] font-light leading-relaxed text-white/75 whitespace-pre-line">
                {evento.eventTerms}
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/[0.04] p-4">
                <input
                  type="checkbox"
                  checked={acepta}
                  onChange={(e) => setAcepta(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-500)]"
                />
                <span className="text-[13px] font-light leading-snug text-white/75">
                  Leí y acepto las condiciones de esta entrada.
                </span>
              </label>
              <TextureButton
                variant="brand"
                size="default"
                disabled={!acepta}
                className="mt-5 disabled:opacity-40"
                onClick={() => setPaso('pago')}
              >
                Continuar
              </TextureButton>
            </motion.div>
          )}

          {paso === 'pago' && (
            <motion.div
              key="pago"
              initial={{ opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="px-4"
            >
              {/* El precio recién aparece acá: después de las condiciones. */}
              <div className="mt-2 rounded-3xl bg-white/[0.05] p-5 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Precio de la entrada</p>
                <p className="mt-1 text-[40px] font-black leading-none">{precio.primary}</p>
                {precio.secondary && <p className="mt-1 text-[13px] font-light text-white/45">{precio.secondary}</p>}
              </div>

              {fin ? (
                <>
                  <p className="mt-5 text-[12.5px] font-medium text-white/60">¿Cómo quieres pagar?</p>
                  <div className="mt-2 space-y-2">
                    <OpcionPago
                      activa={!financiado}
                      titulo="Pagar completo"
                      detalle={`Un solo pago de ${precio.primary}`}
                      onClick={() => setFinanciado(false)}
                    />
                    <OpcionPago
                      activa={financiado}
                      titulo="Financiado"
                      detalle={`Inicial de ${publicPriceLabel(inicial, shop).primary} y ${fin.installments} cuotas`}
                      onClick={() => setFinanciado(true)}
                    />
                  </div>

                  <AnimatePresence initial={false}>
                    {financiado && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ height: { duration: 0.26, ease: [0.23, 1, 0.32, 1] }, opacity: { duration: 0.18 } }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 rounded-2xl bg-white/[0.04] p-4">
                          {fin.installments > 2 && (
                            <div className="mb-3">
                              <p className="text-[12px] font-medium text-white/60">¿En cuántas cuotas?</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {Array.from({ length: fin.installments - 1 }, (_, i) => i + 2).map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => setCuotas(n)}
                                    className={`wallet-tap min-w-11 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors ${
                                      cuotasElegidas === n
                                        ? 'bg-[var(--color-brand-500)] text-white'
                                        : 'bg-white/[0.07] text-white/60 hover:bg-white/[0.12]'
                                    }`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <p className="text-[12px] font-medium text-white/60">Tu plan de pago</p>
                          <div className="mt-2 space-y-1.5">
                            <LineaCuota etiqueta="Inicial (hoy)" valor={publicPriceLabel(inicial, shop).primary} destacada />
                            {Array.from({ length: cuotasElegidas }, (_, i) => (
                              <LineaCuota
                                key={i}
                                etiqueta={`Cuota ${i + 1} · ${FRECUENCIA[fin.frequency] ?? 'cada mes'}`}
                                valor={publicPriceLabel(porCuota, shop).primary}
                              />
                            ))}
                          </div>
                          <p className="mt-3 border-t border-white/[0.08] pt-2 text-[11px] font-light text-white/40">
                            Tu entrada se activa al pagar la inicial, y su código se completa a
                            medida que pagas las cuotas.
                            {fin.deadline &&
                              ` Todo el plan se paga antes del ${new Date(`${fin.deadline}T00:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'long' })}.`}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <p className="mt-4 rounded-2xl bg-white/[0.04] px-4 py-3 text-center text-[12.5px] font-light text-white/50">
                  Esta entrada se paga completa.
                </p>
              )}

              <TextureButton variant="brand" size="default" className="mt-6" onClick={() => setPaso('tutorial')}>
                Pagar
              </TextureButton>
            </motion.div>
          )}

          {paso === 'tutorial' && (
            <motion.div
              key="tutorial"
              initial={{ opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="px-4"
            >
              <div className="mt-3 flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-500)]/15">
                  <Wallet className="h-6 w-6 text-[var(--color-brand-500)]" />
                </span>
                <h2 className="mt-3 text-[20px] font-bold">Tu entrada vive en QuickTap Wallet</h2>
                <p className="mt-1 max-w-[19rem] text-[12.5px] font-light leading-relaxed text-white/50">
                  Ahí guardas tu código, ves lo que te falta pagar y abonas tus cuotas.
                </p>
              </div>

              <ol className="mt-5 space-y-2.5">
                <PasoTutorial n={1} icono={Smartphone} titulo="Entra a quicktap.club/wallet" texto="Desde el navegador de tu teléfono, sin instalar nada." />
                <PasoTutorial n={2} icono={Check} titulo="Identifícate" texto="Con el mismo teléfono de esta compra y tu cédula." />
                <PasoTutorial n={3} icono={Ticket} titulo="Abre Entradas" texto="Ahí está tu boleto. Tócalo y se voltea para mostrar el código." />
              </ol>

              <p className="mt-5 rounded-2xl bg-white/[0.04] px-4 py-3 text-[11.5px] font-light leading-snug text-white/50">
                Al terminar te abrimos WhatsApp con tu pedido para coordinar el pago con
                {' '}{shop.name}. Tu entrada aparece en el Wallet en cuanto lo confirmen.
              </p>

              <TextureButton variant="brand" size="default" className="mt-5" onClick={() => onComprar(financiado, cuotasElegidas)}>
                Continuar al pago
              </TextureButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Fila({ icono: Icono, texto }: { icono: typeof Calendar; texto: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] font-light text-white/65">
      <Icono className="h-4 w-4 shrink-0 text-white/35" />
      <span className="first-letter:uppercase">{texto}</span>
    </div>
  );
}

function OpcionPago({
  activa,
  titulo,
  detalle,
  onClick,
}: {
  activa: boolean;
  titulo: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
        activa ? 'bg-[var(--color-brand-500)]/15 ring-1 ring-[var(--color-brand-500)]/50' : 'bg-white/[0.04] hover:bg-white/[0.07]'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
          activa ? 'scale-100 bg-[var(--color-brand-500)]' : 'scale-90 border border-white/25'
        }`}
      >
        {activa && <Check className="h-2.5 w-2.5 text-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{titulo}</span>
        <span className="block text-[11.5px] font-light text-white/50">{detalle}</span>
      </span>
    </button>
  );
}

function LineaCuota({ etiqueta, valor, destacada }: { etiqueta: string; valor: string; destacada?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className={destacada ? 'font-semibold text-white' : 'font-light text-white/55'}>{etiqueta}</span>
      <span className={`tabular-nums ${destacada ? 'font-bold text-white' : 'font-medium text-white/70'}`}>{valor}</span>
    </div>
  );
}

function PasoTutorial({
  n,
  icono: Icono,
  titulo,
  texto,
}: {
  n: number;
  icono: typeof Wallet;
  titulo: string;
  texto: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-500)]/15 text-[11px] font-bold text-[var(--color-brand-500)]">
        {n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Icono className="h-3.5 w-3.5 text-white/40" />
          {titulo}
        </span>
        <span className="mt-0.5 block text-[11.5px] font-light leading-snug text-white/50">{texto}</span>
      </span>
    </li>
  );
}

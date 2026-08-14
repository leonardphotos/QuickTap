import { Link } from 'react-router-dom';
import { Check, Minus, X } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { SeoFaqList, SeoPageLayout } from './SeoPageLayout';

/**
 * Cluster I del plan SEO: intención de investigación comercial ("mejores software
 * para restaurantes"). Formato comparativo por CATEGORÍA de solución — no se nombran
 * marcas de competidores: la comparación útil para quien busca es entre enfoques.
 */

type Cell = 'yes' | 'no' | 'half';

const CRITERIA: { label: string; cuaderno: Cell; pos: Cell; apps: Cell; quicktap: Cell }[] = [
  { label: 'Carta digital QR con precios al día', cuaderno: 'no', pos: 'half', apps: 'no', quicktap: 'yes' },
  { label: 'Pedidos de mesa directo a cocina', cuaderno: 'no', pos: 'half', apps: 'no', quicktap: 'yes' },
  { label: 'Pedidos por WhatsApp armados y con total', cuaderno: 'half', pos: 'no', apps: 'no', quicktap: 'yes' },
  { label: 'Delivery propio con zonas por mapa', cuaderno: 'no', pos: 'no', apps: 'half', quicktap: 'yes' },
  { label: 'Inventario con recetas y costo por plato', cuaderno: 'no', pos: 'half', apps: 'no', quicktap: 'yes' },
  { label: 'Precios en Bs a tasa BCV automática', cuaderno: 'no', pos: 'no', apps: 'no', quicktap: 'yes' },
  { label: 'Sin comisión por pedido', cuaderno: 'yes', pos: 'yes', apps: 'no', quicktap: 'yes' },
  { label: 'Sin comprar hardware especial', cuaderno: 'yes', pos: 'no', apps: 'yes', quicktap: 'yes' },
  { label: 'El cliente y sus datos son tuyos', cuaderno: 'yes', pos: 'yes', apps: 'no', quicktap: 'yes' },
];

const FAQ = [
  {
    q: '¿Cuál es el mejor software para un restaurante pequeño?',
    a: 'El que puedas operar desde el teléfono que ya tienes, sin comprar equipos ni pagar comisión por venta. Para un local pequeño pesa más la simpleza (carta QR, pedidos, WhatsApp) que una lista larga de módulos que nadie va a usar.',
  },
  {
    q: '¿Cuánto cuesta un software para restaurantes?',
    a: 'Los sistemas por licencia tradicionales cobran instalación más mensualidad por terminal; las apps de delivery cobran comisión por pedido (15–30%). QuickTap cobra una mensualidad fija por local, sin comisiones — los planes están publicados en la página de precios.',
  },
  {
    q: '¿Qué debería incluir sí o sí un sistema para restaurantes?',
    a: 'Carta digital actualizable, un flujo de pedidos que llegue a cocina sin transcripción, un canal de venta directo (WhatsApp), control de inventario con recetas y reportes de venta. Todo lo demás es según tu operación.',
  },
  {
    q: '¿QuickTap sirve si ya tengo un punto de venta fiscal?',
    a: 'Sí — muchos locales operan la sala, el delivery y el inventario con QuickTap y mantienen su máquina fiscal para la facturación. QuickTap registra los pagos y sus referencias para el cuadre de caja.',
  },
];

function CellIcon({ v }: { v: Cell }) {
  if (v === 'yes')
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
        <Check className="h-3.5 w-3.5 text-emerald-700" />
      </span>
    );
  if (v === 'half')
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100" title="Parcial o con costo extra">
        <Minus className="h-3.5 w-3.5 text-amber-700" />
      </span>
    );
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-950/[0.06]">
      <X className="h-3.5 w-3.5 text-brand-950/40" />
    </span>
  );
}

export default function ComparativaPage() {
  return (
    <SeoPageLayout>
      <Seo
        title="Mejores software para restaurantes: cómo elegir | QuickTap"
        description="Qué debe incluir un buen software para restaurantes, cuánto debería costar y cómo comparar opciones: menú QR, comandas, delivery, inventario y soporte."
        path="/comparativa"
        faq={FAQ}
      />

      <p className="text-xs font-bold uppercase tracking-widest text-brand-logo">Guía de compra</p>
      <h1 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight max-w-3xl">
        ¿Cuál es el mejor software para tu restaurante? Compara los enfoques
      </h1>
      <div className="mt-5 space-y-4 max-w-3xl">
        <p className="text-brand-950/70 font-light leading-relaxed">
          Antes de comparar marcas, compara enfoques: la mayoría de los locales termina eligiendo entre seguir a mano
          (cuaderno + WhatsApp), un punto de venta tradicional por licencia, apps de delivery de terceros, o una
          plataforma en la nube como QuickTap. Cada camino resuelve cosas distintas — esta tabla muestra qué cubre cada uno.
        </p>
      </div>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4 font-semibold w-[38%]">Qué necesitas</th>
              <th className="py-3 px-3 font-semibold text-center">A mano<br /><span className="font-light text-brand-950/50 text-xs">cuaderno + chats</span></th>
              <th className="py-3 px-3 font-semibold text-center">POS tradicional<br /><span className="font-light text-brand-950/50 text-xs">licencia + equipos</span></th>
              <th className="py-3 px-3 font-semibold text-center">Apps de delivery<br /><span className="font-light text-brand-950/50 text-xs">comisión por pedido</span></th>
              <th className="py-3 px-3 font-semibold text-center bg-brand-logo/[0.06] rounded-t-xl">QuickTap</th>
            </tr>
          </thead>
          <tbody>
            {CRITERIA.map((c, i) => (
              <tr key={c.label} className={i % 2 === 0 ? 'bg-brand-950/[0.02]' : ''}>
                <td className="py-2.5 pr-4 font-medium">{c.label}</td>
                <td className="py-2.5 px-3 text-center"><CellIcon v={c.cuaderno} /></td>
                <td className="py-2.5 px-3 text-center"><CellIcon v={c.pos} /></td>
                <td className="py-2.5 px-3 text-center"><CellIcon v={c.apps} /></td>
                <td className={`py-2.5 px-3 text-center bg-brand-logo/[0.06] ${i === CRITERIA.length - 1 ? 'rounded-b-xl' : ''}`}><CellIcon v={c.quicktap} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-brand-950/45 font-light">
          <Minus className="inline h-3 w-3 text-amber-700" /> = lo cubre parcialmente o con costo/módulo extra.
        </p>
      </div>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl sm:text-2xl font-bold mb-2">Para ser justos: cuándo NO elegir QuickTap</h2>
        <p className="text-brand-950/70 font-light leading-relaxed">
          Si lo único que buscas es una máquina fiscal para facturar, o dependes por completo del tráfico que te traen
          las apps de delivery, un sistema de gestión no es tu primera compra. QuickTap rinde cuando quieres operar tu
          propio canal: tu carta, tus pedidos, tu delivery y tu inventario, con tus datos y sin comisiones por venta.
        </p>
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-xl sm:text-2xl font-bold mb-3">Qué mirar al comparar, punto por punto</h2>
        <ul className="space-y-3 text-brand-950/70 font-light leading-relaxed list-disc pl-5">
          <li><strong className="font-semibold text-brand-950">Costo total, no mensualidad:</strong> suma licencias, equipos obligatorios, instalación y comisiones por pedido. Una mensualidad "barata" con 20% de comisión sale carísima.</li>
          <li><strong className="font-semibold text-brand-950">Tasa del dólar:</strong> si vendes en bolívares, el sistema debe actualizar la tasa BCV solo. Recalcular precios a mano cada mañana no es un flujo, es un castigo.</li>
          <li><strong className="font-semibold text-brand-950">Qué pasa con tus datos:</strong> en las apps de terceros, el cliente es de la app. En tu canal propio, el historial y el teléfono del cliente quedan contigo.</li>
          <li><strong className="font-semibold text-brand-950">Hardware:</strong> pregunta qué tienes que comprar. Lo razonable hoy es empezar con los teléfonos que ya tienen tú y tu equipo.</li>
          <li><strong className="font-semibold text-brand-950">Prueba real:</strong> si no puedes probarlo gratis con tu propia carta antes de pagar, sospecha.</li>
        </ul>
        <p className="mt-4 text-brand-950/70 font-light">
          <Link to="/precios" className="text-brand-logo font-medium hover:underline">Mira los planes y precios de QuickTap</Link>{' '}
          o explora las funciones una por una desde el pie de esta página.
        </p>
      </section>

      <SeoFaqList faq={FAQ} />
    </SeoPageLayout>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bike,
  Boxes,
  ChefHat,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Lightbulb,
  MessageCircle,
  PieChart,
  QrCode,
  Receipt,
  Settings,
  Star,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

/**
 * Centro de tutoriales de QuickTap Restaurantes (quicktap.club/tutoriales).
 *
 * Misma línea gráfica de la landing (blanco, azul de marca, chips redondeados) para que se
 * sienta parte del producto y no un manual aparte. Cada tutorial es deliberadamente corto —
 * pasos numerados con los NOMBRES REALES de las pantallas y botones del panel, más un ejemplo
 * concreto con números — porque el dueño lo lee con el panel abierto en la otra mano.
 */

interface Tutorial {
  id: string;
  categoria: string;
  icono: typeof QrCode;
  titulo: string;
  resumen: string;
  pasos: string[];
  ejemplo: string;
  nota?: string;
}

const CATEGORIAS = ['Primeros pasos', 'Tu carta', 'Inventario y costos', 'Ventas y caja', 'Administración'] as const;

const TUTORIALES: Tutorial[] = [
  {
    id: 'configuracion',
    categoria: 'Primeros pasos',
    icono: Settings,
    titulo: 'Configura tu restaurante',
    resumen: 'Logo, horario, moneda y métodos de pago: lo que tus clientes ven primero.',
    pasos: [
      'Entra a Ajustes → Negocio y carga el logo y los datos de tu restaurante.',
      'En la misma sección define tu horario: fuera de él, la carta avisa que estás cerrado.',
      'En Ajustes → Pagos y moneda elige la moneda de tus precios (USD o EUR). La conversión a bolívares se calcula sola con la tasa BCV del día.',
      'Activa los métodos de pago que aceptas (Pago Móvil, Zelle, efectivo…) y carga sus datos: son los que verán tus clientes al pagar.',
    ],
    ejemplo:
      'Colocas tus precios en dólares y el cliente ve “Bs 784,66” junto a “$1.00”, siempre a la tasa del día — sin que recalcules nada.',
  },
  {
    id: 'mesas-qr',
    categoria: 'Primeros pasos',
    icono: QrCode,
    titulo: 'Crea tus mesas y sus QR',
    resumen: 'Cada mesa tiene su código: el cliente escanea, pide y su comanda llega a cocina.',
    pasos: [
      'Entra a Mesas / QR y crea una zona (Terraza, Salón, Barra…).',
      'Agrega las mesas de esa zona: el número que les pongas es el que ve el mesonero.',
      'Descarga e imprime el QR de cada mesa y pégalo en ella.',
      'Cuando un cliente lo escanea, ve tu carta y pide directo: la comanda cae en Cocina con el número de su mesa.',
    ],
    ejemplo:
      'La mesa “Terraza-4” pide 2 hamburguesas desde el QR. En Cocina aparece la comanda “T4 · 2× Hamburguesa” al instante, sin que nadie la tome a mano.',
  },
  {
    id: 'producto',
    categoria: 'Tu carta',
    icono: UtensilsCrossed,
    titulo: 'Carga tu primer producto',
    resumen: 'Categoría, nombre, precio y foto: tu carta digital se arma producto a producto.',
    pasos: [
      'Entra a Productos y toca “Nueva categoría” — por ejemplo “Pizzas”.',
      'Toca “Nuevo producto”: nombre, precio (en tu moneda base) y la categoría.',
      'Súbele una foto: los productos con foto se piden más.',
      'Guarda. Ya está visible en tu carta pública y en la pantalla de pedidos.',
    ],
    ejemplo:
      'Categoría “Pizzas” → producto “Pizza Margarita”, precio $8.50, foto del plato. El cliente la ve como “Bs 6.670” calculados a la tasa del día.',
  },
  {
    id: 'opciones',
    categoria: 'Tu carta',
    icono: ClipboardList,
    titulo: 'Agrega opciones y extras',
    resumen: 'Tamaños, contornos, extras con precio: el cliente arma su plato sin llamar al mesonero.',
    pasos: [
      'En Productos, abre el producto y entra a sus opciones.',
      'Crea un grupo de opciones — por ejemplo “Tamaño” — y define si es obligatorio elegir una.',
      'Agrega cada opción con su precio adicional (puede ser $0).',
      'El pedido llega a cocina con las opciones elegidas escritas en la comanda.',
    ],
    ejemplo:
      'Grupo “Tamaño” (obligatorio): Personal +$0, Familiar +$4. Grupo “Extras”: Queso extra +$1. La comanda dice “Pizza Margarita · Familiar · Queso extra”.',
  },
  {
    id: 'estrellas',
    categoria: 'Tu carta',
    icono: Star,
    titulo: 'Destaca tus estrellas y promos',
    resumen: 'Los platos marcados aparecen resaltados en la carta — véndelos primero.',
    pasos: [
      'Edita el producto en Productos.',
      'Marca “Estrella de la casa” en tu plato insignia, o “Promo” en el que quieras empujar.',
      'La carta pública los muestra con su distintivo, arriba y con más presencia.',
    ],
    ejemplo:
      'Marcas tu “Parrilla Mixta” como estrella de la casa: aparece destacada al abrir la carta, antes de que el cliente empiece a buscar.',
  },
  {
    id: 'insumos',
    categoria: 'Inventario y costos',
    icono: Boxes,
    titulo: 'Carga tus insumos',
    resumen: 'Lo que compras por kilo, litro o unidad — la base del inventario y de las recetas.',
    pasos: [
      'Entra a Inventario y toca “Agregar insumo”.',
      'Nombre, unidad de medida (kg, L, unidad) y el costo por unidad.',
      'Carga el stock actual y define el stock mínimo.',
      'Cuando un insumo cruce su mínimo, el panel lo resalta y te llega un aviso al teléfono (app instalada).',
    ],
    ejemplo:
      'Insumo “Harina de trigo”, unidad kg, costo $1.20/kg, stock 25 kg, mínimo 5 kg. Al quedar en 4.8 kg te llega: “Harina de trigo por debajo del mínimo”.',
  },
  {
    id: 'receta',
    categoria: 'Inventario y costos',
    icono: ChefHat,
    titulo: 'Crea la receta de un producto',
    resumen: 'El costo del plato sale de sus ingredientes, y el stock se descuenta solo al vender.',
    pasos: [
      'Edita el producto en Productos y en “Costo” elige “Receta” en vez de manual.',
      'Agrega cada insumo con la cantidad que lleva UNA porción.',
      'El costo del plato se calcula en vivo sumando sus ingredientes al precio actual de cada insumo.',
      'Cada vez que una comanda se marca Servida, el inventario descuenta esos ingredientes automáticamente.',
    ],
    ejemplo:
      'Pizza Margarita: 0.250 kg de harina ($0.30) + 0.150 kg de mozzarella ($1.05) + 0.100 kg de salsa ($0.25) = costo $1.60. Si mañana el queso sube, el costo se actualiza solo.',
    nota: 'Las recetas están disponibles desde el plan Elite.',
  },
  {
    id: 'costo-manual',
    categoria: 'Inventario y costos',
    icono: Wallet,
    titulo: '¿Costo manual o receta?',
    resumen: 'Dos formas de decirle al sistema cuánto te cuesta un plato — elige según tu operación.',
    pasos: [
      'Costo manual: escribes el costo tú mismo al crear el producto. Rápido, ideal para empezar o para productos comprados listos (refrescos, postres de terceros).',
      'Receta: el costo sale de los ingredientes y se mueve con ellos. Ideal para platos preparados, porque además descuenta el inventario al vender.',
      'Puedes combinar: recetas en tus platos fuertes y costo manual en el resto.',
    ],
    ejemplo:
      'El refresco lo compras a $0.80 y lo vendes a $1.50 → costo manual. La parrilla lleva 8 ingredientes que suben y bajan → receta.',
  },
  {
    id: 'gastos',
    categoria: 'Inventario y costos',
    icono: Receipt,
    titulo: 'Registra tus gastos',
    resumen: 'Cada compra y cada pago del negocio, con su categoría y su factura — el insumo se repone solo.',
    pasos: [
      'Entra a Administración → Gastos y registra el gasto: monto, categoría (alquiler, nómina, mercado…) y proveedor si aplica.',
      'Adjunta la foto de la factura o el comprobante: queda como soporte.',
      'Si el gasto es compra de un insumo, márcalo y el stock de ese insumo se repone automáticamente.',
      'Estos gastos alimentan el “% fijo sugerido” de tu estructura de costo.',
    ],
    ejemplo:
      'Registras “Mercado semanal — $180, proveedor Distribuidora López” y marcas que repone 25 kg de harina: el gasto queda asentado y el inventario sube solo.',
  },
  {
    id: 'estructura-costo',
    categoria: 'Inventario y costos',
    icono: PieChart,
    titulo: 'Calcula tu estructura de costo',
    resumen: 'Cuánto de cada venta se va en material, fijos y variables — y qué precio deberías cobrar.',
    pasos: [
      'Entra a Administración → Estructura de costo y configura una sola vez: % de costos fijos (el sistema te sugiere uno a partir de tus gastos recurrentes ÷ ventas), % variables y tu margen neto objetivo.',
      'Abre la ficha de un producto y carga sus líneas de material (o tráelas de la receta).',
      'El sistema calcula el precio de venta sugerido para lograr tu margen, y te alerta si el precio actual queda por debajo.',
      'La pestaña de estadísticas te muestra la estructura real del período y el ranking de productos contra el margen objetivo.',
    ],
    ejemplo:
      'Material $2.80 + fijos 18% + variables 12% con margen objetivo 30%: precio sugerido $7.00. Si la vendes a $6.00, la ficha te alerta que el margen real cae a 21%.',
    nota: 'La estructura de costo está disponible desde el plan Elite.',
  },
  {
    id: 'cobrar',
    categoria: 'Ventas y caja',
    icono: CreditCard,
    titulo: 'Cobra una comanda',
    resumen: 'Método, referencia o foto del comprobante, propina — y cuentas divididas sin calculadora.',
    pasos: [
      'En Comandas, abre el pedido y toca “Cobrar”.',
      'Elige el método. Con Pago Móvil, Zelle o transferencia, registra el número de referencia O adjunta la foto del comprobante.',
      'Si dejan propina, regístrala aparte: nunca se mezcla con el total del pedido.',
      '¿Cuenta dividida? Cobra por productos: marca qué ítems paga cada quien y el sistema lleva el saldo restante.',
    ],
    ejemplo:
      'Mesa de 3: uno paga sus 2 cervezas en efectivo, otra paga su pasta por Pago Móvil con referencia, y el pedido muestra el saldo exacto que falta.',
  },
  {
    id: 'caja',
    categoria: 'Ventas y caja',
    icono: Wallet,
    titulo: 'Abre y cierra tu caja',
    resumen: 'El turno queda cuadrado: cuánto entró, por qué método, y el cierre no se altera después.',
    pasos: [
      'Abre la caja al empezar el turno con el fondo inicial.',
      'Vende normal: cada cobro queda atado a la sesión de caja abierta.',
      'Al cerrar, el sistema te muestra el resumen por método de pago para cuadrar contra lo físico.',
      'El cierre queda congelado: aunque después cambien precios o tasas, tu arqueo histórico no se mueve.',
    ],
    ejemplo:
      'Abres con $50 de fondo. Al cierre: $320 en efectivo, Bs 18.400 en Pago Móvil, $85 en Zelle. Cuadras contra la gaveta y cierras — ese papel no cambia nunca.',
  },
  {
    id: 'delivery',
    categoria: 'Ventas y caja',
    icono: Bike,
    titulo: 'Configura tu delivery por zonas',
    resumen: 'Dibuja tus zonas en el mapa con su tarifa, y despacha con tus repartidores.',
    pasos: [
      'En Ajustes → Delivery, dibuja cada zona de reparto sobre el mapa y ponle su tarifa.',
      'Registra a tus repartidores con su WhatsApp.',
      'El cliente pide desde tu carta (sin ?mesa): elige delivery, comparte ubicación y el sistema le cobra la tarifa de su zona.',
      'Al despachar, eliges el repartidor y la comanda le llega por WhatsApp con la dirección.',
    ],
    ejemplo:
      'Zona “Centro” $2, zona “Este” $3.50. Un pedido cae en el Este: el total suma $3.50 solo y al despachar tu repartidor recibe el pedido completo con el mapa.',
  },
  {
    id: 'administracion',
    categoria: 'Administración',
    icono: PieChart,
    titulo: 'Lee tu Resumen y Estadísticas',
    resumen: 'Qué se vendió, qué deja margen y qué no — los números que deciden tu carta.',
    pasos: [
      'Administración → Resumen: las ventas del día y del período, de un vistazo.',
      'Estadísticas: tus productos más vendidos y los horarios fuertes.',
      'Margen de utilidad: qué platos dejan plata de verdad (precio contra costo real).',
      'Con eso decides: subir un precio, empujar una estrella o sacar de la carta lo que no rinde.',
    ],
    ejemplo:
      'Descubres que la “Pasta Alfredo” es tu 2.º plato más vendido pero deja 12% de margen. Le subes $1 al precio o le ajustas la receta — decisión con números, no con instinto.',
  },
  {
    id: 'whatsapp',
    categoria: 'Administración',
    icono: MessageCircle,
    titulo: 'Vincula tu WhatsApp',
    resumen: 'Tus clientes reciben la confirmación de cada pedido directo de tu número — sin escribir a mano.',
    pasos: [
      'En Ajustes → WhatsApp toca “Vincular WhatsApp”.',
      'Desde tu teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo, y escanea el código.',
      'Listo: “recibimos tu pedido”, “va en camino” y “listo para retirar” salen solos de tu número.',
      'Si configuras un número verificador, los comprobantes de pago le llegan y con responder “Aprobado” el pedido pasa a cocina.',
    ],
    ejemplo:
      'Un cliente pide delivery con Pago Móvil: recibe los datos de pago por WhatsApp, manda la foto del comprobante, tu verificador responde “Aprobado” y la comanda entra a cocina sola — con el cobro y su soporte ya registrados.',
    nota: 'Disponible desde el plan Elite.',
  },
];

export default function TutorialsPage() {
  useDocumentMeta('Tutoriales — QuickTap', 'Aprende a usar QuickTap Restaurantes: carta, recetas, inventario, costos, caja y administración.');
  const [categoria, setCategoria] = useState<string>('Primeros pasos');
  const [abierto, setAbierto] = useState<string | null>(null);

  const visibles = useMemo(() => TUTORIALES.filter((t) => t.categoria === categoria), [categoria]);

  return (
    <div className="min-h-screen bg-white text-brand-950">
      {/* ---------- Barra superior, misma de la landing ---------- */}
      <nav aria-label="Principal" className="flex items-center justify-between gap-4 px-6 py-6 sm:px-12">
        <Link to="/" className="flex items-center">
          <img src="/logo/logo-central.png" alt="QuickTap" className="h-6 w-auto" />
        </Link>
        <Link
          to="/empezar"
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-950 px-5 py-2 text-sm font-semibold text-brand-950 transition-colors hover:bg-brand-950 hover:text-white"
        >
          Regístrate <ArrowUpRight className="h-4 w-4" />
        </Link>
      </nav>

      {/* ---------- Encabezado ---------- */}
      <header className="mx-auto max-w-3xl px-6 pt-10 text-center sm:pt-16">
        <p className="text-xs font-medium tracking-wide text-brand-950/40">Centro de tutoriales</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-5xl">Aprende QuickTap, un tutorial a la vez.</h1>
        <p className="mx-auto mt-4 max-w-xl text-base font-light text-brand-950/60">
          Guías cortas, con los nombres reales de cada pantalla y un ejemplo con números. Léelas
          con el panel abierto y ve haciendo.
        </p>
      </header>

      {/* ---------- Categorías ---------- */}
      <div className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-1 px-4">
        <div className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1">
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategoria(c);
                setAbierto(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                categoria === c ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Tutoriales ---------- */}
      <main className="mx-auto max-w-3xl space-y-3 px-4 pb-20 pt-8">
        {visibles.map((t) => {
          const abiertoAqui = abierto === t.id;
          return (
            <article key={t.id} className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setAbierto(abiertoAqui ? null : t.id)}
                className="flex w-full items-center gap-3.5 px-5 py-4 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                  <t.icono className="h-[18px] w-[18px] text-brand-600" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{t.titulo}</span>
                  <span className="block text-[12.5px] font-light text-brand-950/55">{t.resumen}</span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-brand-950/30 transition-transform duration-300 ${abiertoAqui ? 'rotate-180' : ''}`}
                />
              </button>

              {/* grid-rows: el truco CSS para animar height:auto sin medirlo en JS. */}
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                  abiertoAqui ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-brand-950/[0.06] px-5 pb-5 pt-4">
                    <ol className="space-y-2.5">
                      {t.pasos.map((p, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-brand-950 text-[11px] font-bold text-white">
                            {i + 1}
                          </span>
                          <span className="text-sm font-light leading-relaxed text-brand-950/80">{p}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="mt-4 flex gap-3 rounded-xl border-l-2 border-brand-500 bg-brand-500/[0.06] px-4 py-3">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <p className="text-[13px] font-light leading-relaxed text-brand-950/75">
                        <span className="font-semibold text-brand-950">Ejemplo: </span>
                        {t.ejemplo}
                      </p>
                    </div>

                    {t.nota && <p className="mt-3 text-[11.5px] font-medium text-amber-700">{t.nota}</p>}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {/* ---------- Cierre ---------- */}
        <div className="pt-10 text-center">
          <p className="text-sm font-light text-brand-950/55">
            ¿Te quedó una duda que ningún tutorial responde?
          </p>
          <a
            href="https://wa.me/584244572008?text=Hola%2C%20tengo%20una%20duda%20usando%20QuickTap"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-950 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <MessageCircle className="h-4 w-4" /> Escríbenos por WhatsApp
          </a>
        </div>
      </main>
    </div>
  );
}

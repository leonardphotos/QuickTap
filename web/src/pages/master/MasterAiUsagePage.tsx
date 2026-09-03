import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { masterApi } from '@/api/client';

/**
 * Consumo de Gemini (panel maestro).
 *
 * Es la cuenta de luz de la plataforma: la carga de catálogo con IA la corre el equipo de
 * QuickTap sobre el cliente que sea, y la factura la paga QuickTap. Lo que hay que poder
 * responder de un vistazo es tres cosas — cuánto se gastó, en qué operación se fue, y a qué
 * cliente se le estaba cargando cuando se gastó.
 *
 * El razonamiento va separado de la salida a propósito, aunque se cobre igual: son los tokens
 * que el modelo consume pensando antes de contestar, no se ven en ninguna respuesta, y son el
 * número que delata una operación que está usando un modelo pensante donde no hace falta.
 * Cuando aquí se midió por primera vez, era el 34% del gasto.
 */

interface Suma {
  llamadas: number;
  entrada: number;
  salida: number;
  razonamiento: number;
  total: number;
  ms: number;
  costo: number | null;
}

interface Grupo extends Suma {
  clave: string;
}

interface Consumo {
  rango: string;
  desde: string;
  precios: { entrada: number; salida: number } | null;
  totales: Suma;
  porDia: { dia: string; total: number; llamadas: number }[];
  porOperacion: Grupo[];
  porRestaurante: Grupo[];
  porModelo: Grupo[];
  ultimas: {
    id: string;
    operacion: string;
    modelo: string;
    restaurante: string | null;
    entrada: number;
    salida: number;
    razonamiento: number;
    total: number;
    ms: number;
    createdAt: string;
  }[];
}

const RANGOS = [
  { valor: 'hoy', label: 'Hoy' },
  { valor: 'semana', label: '7 días' },
  { valor: 'mes', label: '30 días' },
  { valor: 'trimestre', label: '90 días' },
] as const;

/** Qué es cada operación, en cristiano. Los nombres crudos son rutas del microservicio. */
const NOMBRES: Record<string, string> = {
  'leer-insumos': 'Leer lista de insumos',
  'clasificar-insumos': 'Clasificar insumos',
  'vincular-insumos': 'Cruzar con el inventario',
  'leer-carta': 'Leer la carta',
  'leer-recetas': 'Leer el recetario',
  'fichas-tecnicas': 'Armar fichas técnicas',
  'vincular-empaques': 'Elegir empaques',
  'analizar-plato': 'Analizar foto de plato',
  'enhance-image': 'Mejorar foto',
  'white-background': 'Fondo blanco',
};

function miles(n: number): string {
  return n.toLocaleString('es-VE');
}

/** 12.400 -> "12,4k". Los totales de tokens se leen mejor redondeados. */
function corto(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.', ',')}k`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
}

function segundos(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export default function MasterAiUsagePage() {
  const [rango, setRango] = useState<string>('mes');
  const [datos, setDatos] = useState<Consumo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await masterApi.get('/master/ai-usage', { params: { rango } });
      setDatos(data.data);
      setError(null);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo leer el consumo.');
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const t = datos?.totales;
  // Qué parte del gasto se fue en pensar. Es el número que dice si hay una operación usando un
  // modelo pensante donde no hace falta: transcribir no requiere razonar.
  const pctRazona = t && t.total > 0 ? Math.round((t.razonamiento / t.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Consumo de IA</h1>
          <p className="mt-1 text-sm font-light text-brand-950/50">
            Lo que gasta QuickTap en Gemini. Cada llamada de la carga de catálogo queda registrada con lo que costó, en
            qué se usó y a qué cliente se le estaba cargando.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-brand-950/5 p-1">
            {RANGOS.map((r) => (
              <button
                key={r.valor}
                type="button"
                onClick={() => setRango(r.valor)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  rango === r.valor ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void cargar()}
            title="Actualizar"
            className="rounded-lg border border-brand-950/10 p-2 text-brand-950/40 hover:text-brand-950"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {datos && t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              titulo="Tokens"
              valor={corto(t.total)}
              detalle={`${miles(t.llamadas)} llamada${t.llamadas === 1 ? '' : 's'}`}
            />
            <Kpi
              titulo="Costo"
              valor={t.costo === null ? '—' : `$${t.costo.toFixed(2)}`}
              detalle={
                datos.precios
                  ? `$${datos.precios.entrada}/M entrada · $${datos.precios.salida}/M salida`
                  : 'sin precios configurados'
              }
            />
            <Kpi
              titulo="Razonamiento"
              valor={`${pctRazona}%`}
              detalle={`${corto(t.razonamiento)} tokens pensando`}
              alerta={pctRazona >= 30}
            />
            <Kpi titulo="Tiempo de espera" valor={segundos(t.ms)} detalle="sumando todas las llamadas" />
          </div>

          <Tarjeta titulo="Por día">
            <BarrasPorDia dias={datos.porDia} />
          </Tarjeta>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo="En qué se fue">
              <ListaGrupos
                grupos={datos.porOperacion}
                total={t.total}
                etiqueta={(k) => NOMBRES[k] ?? k}
                vacio="Todavía no se ha usado la IA en este período."
              />
            </Tarjeta>
            <Tarjeta titulo="A qué cliente se le estaba cargando">
              <ListaGrupos
                grupos={datos.porRestaurante}
                total={t.total}
                etiqueta={(k) => k}
                vacio="Ninguna llamada quedó atada a un cliente."
              />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Últimas llamadas">
            {datos.ultimas.length === 0 ? (
              <p className="text-sm font-light text-brand-950/40">Nada todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-950/10 text-left text-[11px] uppercase tracking-wide text-brand-950/40">
                      <th className="py-1.5 pr-3 font-medium">Cuándo</th>
                      <th className="py-1.5 pr-3 font-medium">Operación</th>
                      <th className="py-1.5 pr-3 font-medium">Cliente</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Entrada</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Salida</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Razona</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                      <th className="py-1.5 text-right font-medium">Tardó</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {datos.ultimas.map((l) => (
                      <tr key={l.id} className="border-b border-brand-950/5 last:border-0">
                        <td className="whitespace-nowrap py-1.5 pr-3 text-brand-950/50">
                          {new Date(l.createdAt).toLocaleString('es-VE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-1.5 pr-3 text-brand-950">{NOMBRES[l.operacion] ?? l.operacion}</td>
                        <td className="max-w-[12rem] truncate py-1.5 pr-3 text-brand-950/50">{l.restaurante ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-right text-brand-950/50">{miles(l.entrada)}</td>
                        <td className="py-1.5 pr-3 text-right text-brand-950/50">{miles(l.salida)}</td>
                        <td
                          className={`py-1.5 pr-3 text-right ${
                            l.razonamiento > l.entrada + l.salida ? 'font-medium text-amber-700' : 'text-brand-950/50'
                          }`}
                        >
                          {miles(l.razonamiento)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-medium text-brand-950">{miles(l.total)}</td>
                        <td className="py-1.5 text-right text-brand-950/40">{segundos(l.ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </>
      )}

      {!datos && !cargando && !error && (
        <p className="text-sm font-light text-brand-950/40">Sin datos todavía.</p>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${alerta ? 'border-amber-300' : 'border-brand-950/10'}`}>
      <p className="text-[11px] uppercase tracking-wide text-brand-950/40">{titulo}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-brand-950">{valor}</p>
      <p className="text-[11px] font-light text-brand-950/50">{detalle}</p>
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
      <p className="font-semibold text-brand-950">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * Barras por día, en SVG a mano.
 *
 * Los días sin consumo salen igual, en cero: una barra que falta se lee como "el gráfico no
 * cargó", y un cero se lee como "ese día no se gastó nada", que es la verdad.
 */
function BarrasPorDia({ dias }: { dias: { dia: string; total: number; llamadas: number }[] }) {
  const max = Math.max(1, ...dias.map((d) => d.total));
  const ancho = 1000;
  const alto = 160;
  const paso = ancho / Math.max(dias.length, 1);
  const grosor = Math.max(2, Math.min(paso - 3, 34));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${ancho} ${alto + 22}`} className="h-48 w-full min-w-[520px]" role="img" aria-label="Tokens por día">
        {/* Tres líneas de referencia: sin ellas una barra alta no se puede comparar con nada. */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={ancho}
            y1={alto - alto * f}
            y2={alto - alto * f}
            stroke="currentColor"
            strokeWidth={1}
            className="text-brand-950/8"
          />
        ))}
        <text x={2} y={12} className="fill-current text-[11px] text-brand-950/40">
          {corto(max)}
        </text>
        {dias.map((d, i) => {
          const h = (d.total / max) * alto;
          const x = i * paso + (paso - grosor) / 2;
          return (
            <g key={d.dia}>
              <title>{`${d.dia}: ${miles(d.total)} tokens · ${d.llamadas} llamada(s)`}</title>
              {/* Zona sensible de alto completo: apuntarle a una barra de 3 px es imposible. */}
              <rect x={i * paso} y={0} width={paso} height={alto} fill="transparent" />
              <rect
                x={x}
                y={alto - h}
                width={grosor}
                height={Math.max(h, d.total > 0 ? 2 : 0)}
                rx={2}
                className="fill-current text-brand-500"
              />
            </g>
          );
        })}
        {/* Una etiqueta cada tantos días: con 90 barras no cabe una por barra. */}
        {dias.map((d, i) => {
          const cada = dias.length <= 10 ? 1 : dias.length <= 31 ? 5 : 15;
          if (i % cada !== 0) return null;
          return (
            <text
              key={d.dia}
              x={i * paso + paso / 2}
              y={alto + 16}
              textAnchor="middle"
              className="fill-current text-[10px] text-brand-950/35"
            >
              {d.dia.slice(8)}/{d.dia.slice(5, 7)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** Lista con barra de proporción: se lee el reparto sin tener que dividir de cabeza. */
function ListaGrupos({
  grupos,
  total,
  etiqueta,
  vacio,
}: {
  grupos: Grupo[];
  total: number;
  etiqueta: (clave: string) => string;
  vacio: string;
}) {
  if (grupos.length === 0) return <p className="text-sm font-light text-brand-950/40">{vacio}</p>;
  return (
    <ul className="space-y-2">
      {grupos.map((g) => {
        const pct = total > 0 ? (g.total / total) * 100 : 0;
        return (
          <li key={g.clave}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-brand-950">{etiqueta(g.clave)}</span>
              <span className="shrink-0 tabular-nums text-brand-950/50">
                {corto(g.total)}
                <span className="text-brand-950/30">
                  {' '}
                  · {Math.round(pct)}% · {g.llamadas} llamada{g.llamadas === 1 ? '' : 's'}
                  {g.costo !== null ? ` · $${g.costo.toFixed(2)}` : ''}
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-950/8">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

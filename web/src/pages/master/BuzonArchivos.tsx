import { useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, HelpCircle, Upload, X } from 'lucide-react';
import { AI_TIMEOUT_MS, masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Buzón: se sueltan todos los Excel del cliente de una vez y el sistema dice qué es cada uno.
 *
 * Un restaurante que se muda no manda "el archivo de insumos": manda una carpeta con todo lo
 * que tiene —el inventario, la carta, el recetario, la lista de clientes, el libro de compras
 * del contador— con nombres como "Copia de FINAL2 (recuperado).xlsx". Abrir cada uno para
 * saber qué es, y después subirlo por la pestaña correcta, es el trabajo aburrido que hace que
 * migrar un cliente tome una tarde.
 *
 * La identificación es DETERMINISTA: se puntúa cada hoja contra la forma conocida de cada
 * documento (qué columnas trae, cuáles son obligatorias) y pesa además el nombre del archivo y
 * de la hoja, que es como lo resolvería una persona. La IA no participa: reconocer que una
 * hoja con "PRODUCTO | UND | EXISTENCIA | COSTO" es un inventario no necesita un modelo, y un
 * modelo puede equivocarse y mandar la lista de clientes al inventario.
 */

type Tipo = 'insumos' | 'productos' | 'recetas' | 'clientes' | 'proveedores' | 'compras' | 'ventas' | 'desconocido';

interface Hoja {
  hoja: string;
  tipo: Tipo;
  etiqueta: string;
  queHace: string;
  soportado: boolean;
  confianza: number;
  columnas: string[];
  filas: number;
  motivo: string;
  muestra: string[][];
}

interface Detectado {
  archivo: string;
  hojas: Hoja[];
  tipo: Tipo;
  etiqueta: string;
  soportado: boolean;
  error?: string;
}

/** Qué hacer con cada tipo, y por dónde se carga. */
const DESTINO: Record<Tipo, { pestana: string; comoSeCarga: string } | null> = {
  insumos: { pestana: 'Insumos', comoSeCarga: 'Súbelo en la pestaña Insumos: se leen existencias, costos y empaques.' },
  productos: { pestana: 'Carta completa', comoSeCarga: 'Súbelo en "Cliente nuevo: carga la carta completa".' },
  recetas: { pestana: 'Recetas', comoSeCarga: 'Súbelo en la pestaña Recetas → "Subir el recetario del cliente".' },
  clientes: { pestana: 'Clientes', comoSeCarga: 'Se carga desde acá mismo.' },
  proveedores: { pestana: 'Proveedores', comoSeCarga: 'Se carga desde acá mismo.' },
  compras: null,
  ventas: null,
  desconocido: null,
};

/** Por qué un tipo identificado todavía no se carga. Se dice, no se esconde. */
const PORQUE_NO: Partial<Record<Tipo, string>> = {
  compras: 'Cargarlo crearía meses de gastos que entran en su contabilidad y le cambian el resultado del período. Es una decisión del cliente, no del montaje.',
  ventas: 'Las ventas viejas entrarían como pedidos y ensuciarían sus reportes, su caja y sus estadísticas. QuickTap arranca a facturar desde el día uno.',
  desconocido: 'No se reconocieron encabezados de ningún documento conocido. Puede ser una hoja de notas, un archivo con el encabezado muy abajo, o algo que todavía no sabemos leer.',
};

const COLORES: Record<string, string> = {
  ok: 'border-emerald-300 bg-emerald-50',
  info: 'border-brand-950/10 bg-white',
  no: 'border-amber-300 bg-amber-50',
  error: 'border-red-300 bg-red-50',
};

export default function BuzonArchivos({
  restaurantId,
  onError,
  onAviso,
  onCargado,
}: {
  restaurantId: string;
  onError: (m: string | null) => void;
  onAviso: (m: string | null) => void;
  onCargado: () => Promise<void>;
}) {
  const [archivos, setArchivos] = useState<Detectado[]>([]);
  const [originales, setOriginales] = useState<File[]>([]);
  const [analizando, setAnalizando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const entradaRef = useRef<HTMLInputElement>(null);

  async function subir(lista: FileList) {
    onError(null);
    onAviso(null);
    setAnalizando(true);
    try {
      const files = Array.from(lista);
      const form = new FormData();
      for (const f of files) form.append('files', f);
      const { data } = await masterApi.post(`/master/inbox/${restaurantId}/clasificar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: AI_TIMEOUT_MS,
      });
      const detectados: Detectado[] = data.data ?? [];
      setArchivos(detectados);
      setOriginales(files);
      const reconocidos = detectados.filter((d) => d.tipo !== 'desconocido').length;
      onAviso(`${reconocidos} de ${detectados.length} archivo(s) reconocidos.`);
    } catch (e: any) {
      onError(e.response?.data?.error ?? 'No se pudieron leer los archivos.');
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-brand-950/10 bg-white p-6 shadow-sm">
      <div>
        <p className="font-semibold text-brand-950">Suelta todos los archivos del cliente</p>
        <p className="mt-1 text-sm font-light text-brand-950/50">
          El inventario, la carta, el recetario, la lista de clientes, el libro del contador — todos juntos, como te los
          mandó. El sistema abre cada uno, mira sus encabezados y te dice qué es, hoja por hoja. No escribe nada hasta
          que tú lo mandes.
        </p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) void subir(e.dataTransfer.files);
        }}
        className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-950/15 px-4 py-8 text-center"
      >
        <FileSpreadsheet className="h-7 w-7 text-brand-950/25" />
        <p className="text-sm font-medium text-brand-950">Arrastra los archivos aquí</p>
        <p className="text-xs font-light text-brand-950/40">
          Hasta 10 archivos .xlsx a la vez. Los .xls viejos y los .csv hay que reguardarlos como .xlsx.
        </p>
        <TextureButton
          type="button"
          variant="brand"
          size="sm"
          className="mt-1 !w-auto"
          disabled={analizando}
          onClick={() => entradaRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> {analizando ? 'Revisando…' : 'Elegir archivos'}
        </TextureButton>
        <input
          ref={entradaRef}
          type="file"
          multiple
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void subir(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {archivos.length > 0 && (
        <div className="space-y-2">
          {archivos.map((a, i) => {
            const destino = DESTINO[a.tipo];
            const color = a.error ? 'error' : a.tipo === 'desconocido' ? 'no' : a.soportado ? 'ok' : 'no';
            const util = a.hojas.filter((h) => h.tipo !== 'desconocido');
            return (
              <div key={a.archivo + i} className={`rounded-xl border p-3 ${COLORES[color]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-brand-950">
                      {a.soportado ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <HelpCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <span className="truncate">{a.archivo}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-brand-950/70">
                      <span className="font-medium">{a.etiqueta}</span>
                      {util[0] ? ` · ${util[0].filas} fila${util[0].filas === 1 ? '' : 's'}` : ''}
                      {a.hojas.length > 1 ? ` · ${a.hojas.length} hojas` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAbierto(abierto === a.archivo ? null : a.archivo)}
                    className="shrink-0 text-xs font-medium text-brand-500 hover:text-brand-600"
                  >
                    {abierto === a.archivo ? 'Ocultar' : 'Ver qué trae'}
                  </button>
                </div>

                {a.error && <p className="mt-1 text-xs text-red-700">{a.error}</p>}

                {!a.error && (
                  <p className="mt-1 text-xs font-light text-brand-950/60">
                    {destino ? (
                      <>
                        {a.hojas.find((h) => h.tipo === a.tipo)?.queHace} <span className="font-medium">{destino.comoSeCarga}</span>
                      </>
                    ) : (
                      PORQUE_NO[a.tipo]
                    )}
                  </p>
                )}

                {abierto === a.archivo && (
                  <div className="mt-2 space-y-2 border-t border-brand-950/10 pt-2">
                    {a.hojas.map((h) => (
                      <div key={h.hoja} className="text-xs">
                        <p className="font-medium text-brand-950">
                          {h.hoja}{' '}
                          <span className="font-normal text-brand-950/40">
                            — {h.etiqueta}
                            {h.confianza > 0 ? ` (${h.confianza}% de coincidencia)` : ''} · {h.filas} fila
                            {h.filas === 1 ? '' : 's'}
                          </span>
                        </p>
                        <p className="text-brand-950/50">{h.motivo}</p>
                        {h.muestra.length > 0 && (
                          <div className="mt-1 overflow-x-auto">
                            <table className="text-[11px] text-brand-950/60">
                              <tbody>
                                {h.muestra.map((fila, y) => (
                                  <tr key={y} className={y === 0 ? 'font-medium text-brand-950/80' : ''}>
                                    {fila.map((celda, x) => (
                                      <td key={x} className="max-w-[10rem] truncate border-b border-brand-950/5 py-0.5 pr-3">
                                        {celda}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(a.tipo === 'clientes' || a.tipo === 'proveedores') && !a.error && (
                  <CargaDirecta
                    restaurantId={restaurantId}
                    tipo={a.tipo}
                    archivo={originales[i]}
                    hoja={a.hojas.find((h) => h.tipo === a.tipo)?.hoja}
                    onError={onError}
                    onAviso={onAviso}
                    onCargado={onCargado}
                  />
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setArchivos([]);
              setOriginales([]);
            }}
            className="flex items-center gap-1 text-xs font-medium text-brand-950/40 hover:text-brand-950"
          >
            <X className="h-3.5 w-3.5" /> Limpiar la lista
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Clientes y proveedores se cargan desde acá: son listas planas, sin nada que estimar ni
 * cruzar, así que no tiene sentido mandarlas a una pestaña aparte a hacer el mismo viaje.
 * Insumos, carta y recetas sí, porque ahí hay una revisión de verdad que hacer.
 */
function CargaDirecta({
  restaurantId,
  tipo,
  archivo,
  hoja,
  onError,
  onAviso,
  onCargado,
}: {
  restaurantId: string;
  tipo: 'clientes' | 'proveedores';
  archivo: File | undefined;
  hoja?: string;
  onError: (m: string | null) => void;
  onAviso: (m: string | null) => void;
  onCargado: () => Promise<void>;
}) {
  const [filas, setFilas] = useState<any[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function leer() {
    if (!archivo) return;
    onError(null);
    setTrabajando(true);
    try {
      const form = new FormData();
      form.append('file', archivo);
      if (hoja) form.append('hoja', hoja);
      const { data } = await masterApi.post(`/master/inbox/${restaurantId}/leer-${tipo}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFilas(data.data ?? []);
    } catch (e: any) {
      onError(e.response?.data?.error ?? `No se pudo leer la lista de ${tipo}.`);
    } finally {
      setTrabajando(false);
    }
  }

  async function cargar() {
    if (!filas) return;
    setTrabajando(true);
    try {
      const { data } = await masterApi.post(`/master/inbox/${restaurantId}/confirmar-${tipo}`, { [tipo]: filas });
      const d = data.data;
      onAviso(`${d.creados} ${tipo} creados y ${d.actualizados} actualizados.`);
      setFilas(null);
      await onCargado();
    } catch (e: any) {
      onError(e.response?.data?.error ?? `No se pudieron cargar los ${tipo}.`);
    } finally {
      setTrabajando(false);
    }
  }

  const nuevos = filas?.filter((f) => !f.yaExiste).length ?? 0;

  return (
    <div className="mt-2 border-t border-brand-950/10 pt-2">
      {filas === null ? (
        <button
          type="button"
          disabled={trabajando || !archivo}
          onClick={() => void leer()}
          className="text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-40"
        >
          {trabajando ? 'Leyendo…' : `Revisar los ${tipo} de este archivo`}
        </button>
      ) : (
        <>
          <p className="text-xs text-brand-950/60">
            <span className="font-medium text-brand-950">{filas.length}</span> {tipo} · {nuevos} nuevos ·{' '}
            {filas.length - nuevos} ya los tiene (se actualizan)
          </p>
          <div className="mt-1 max-h-40 overflow-y-auto">
            <ul className="space-y-0.5 text-[11px] text-brand-950/60">
              {filas.slice(0, 60).map((f, i) => (
                <li key={i} className="truncate">
                  {f.nombre}
                  <span className="text-brand-950/35">
                    {' '}
                    {tipo === 'clientes' ? f.telefono : [f.rif, f.telefono].filter(Boolean).join(' · ')}
                  </span>
                  {f.yaExiste && <span className="text-emerald-700"> · ya existe</span>}
                </li>
              ))}
            </ul>
            {filas.length > 60 && <p className="text-[11px] text-brand-950/35">y {filas.length - 60} más…</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <TextureButton
              type="button"
              variant="accent"
              size="sm"
              className="!w-auto"
              disabled={trabajando}
              onClick={() => void cargar()}
            >
              {trabajando ? 'Cargando…' : `Cargar ${filas.length}`}
            </TextureButton>
            <button
              type="button"
              onClick={() => setFilas(null)}
              className="text-xs font-medium text-brand-950/40 hover:text-brand-950"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

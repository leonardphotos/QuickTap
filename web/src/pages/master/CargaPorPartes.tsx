import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Upload, X } from 'lucide-react';
import { AI_TIMEOUT_MS, masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Carga por partes en un cliente que YA está montado.
 *
 * La carga de carta completa (MasterCatalogAiPage) sirve para un cliente nuevo: entra una
 * carta y sale un catálogo entero. Un cliente que ya opera necesita lo contrario — cargarle
 * SOLO la pieza que le falta sin pisar lo que ya tiene, y que esa pieza se enganche con lo
 * que hay.
 *
 * El caso que manda: el cliente ya tiene sus recetas armadas pero sus insumos en cero, así
 * que todos sus platos cuestan cero. Al subirle la lista real de insumos, cada uno se vincula
 * con el que ya existía (por nombre, y lo que no calza por nombre lo cruza la IA) y el
 * backend vuelve a costear todas las recetas que lo usaban. No se rehace ninguna receta: se
 * les enciende el costo.
 */

const UNIDADES = ['kg', 'lt', 'unidad'];

interface Estado {
  resumen: {
    productos: number;
    productosConReceta: number;
    productosSinReceta: number;
    insumos: number;
    insumosSinCosto: number;
    preparaciones: number;
  };
  productosSinReceta: { id: string; nombre: string; categoria: string; descripcion: string; precio: number }[];
  insumos: { id: string; nombre: string; unidad: string; cantidad: number; costo: number; usadoEn: number }[];
}

interface FilaInsumo {
  key: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  minimo: number;
  categoria: string;
  /** Insumo existente con el que se vincula. Vacío = se crea uno nuevo. */
  inventoryItemId: string;
  vinculoPor: 'nombre' | 'ia' | null;
  usadoEn: number;
}

interface LineaInsumo {
  nombre: string;
  unidad: string;
  cantidad: number;
  yaExiste?: boolean;
}

interface Preparacion {
  nombre: string;
  unidad: string;
  rendimiento: number;
  cantidad: number;
  insumos: LineaInsumo[];
  yaExiste?: boolean;
}

interface FilaReceta {
  key: string;
  productId: string | null;
  nombre: string;
  yaTeniaReceta: boolean;
  insumos: LineaInsumo[];
  preparaciones: Preparacion[];
}

const ARCHIVOS = 'image/jpeg,image/png,image/webp,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function CargaPorPartes({ restaurantId, titulo }: { restaurantId: string; titulo: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [pestana, setPestana] = useState<'insumos' | 'recetas'>('insumos');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarEstado = useCallback(async () => {
    if (!restaurantId) {
      setEstado(null);
      return;
    }
    try {
      const { data } = await masterApi.get(`/master/catalog-ai/${restaurantId}/estado`);
      setEstado(data.data);
    } catch {
      setEstado(null);
    }
  }, [restaurantId]);

  useEffect(() => {
    void cargarEstado();
  }, [cargarEstado]);

  if (!restaurantId) return null;

  const r = estado?.resumen;

  return (
    <div className="space-y-4 rounded-2xl border border-brand-950/10 bg-white p-6 shadow-sm">
      <div>
        <p className="font-semibold text-brand-950">{titulo}</p>
        <p className="mt-1 text-sm font-light text-brand-950/50">
          Para un cliente que ya está operando. Se le carga la pieza que le falta —sus insumos, sus recetas— sin tocar
          nada de lo que ya tiene. Los insumos que subas se <span className="font-medium">vinculan</span> con los que ya
          existen, así que las recetas ya armadas quedan costeadas solas.
        </p>
      </div>

      {r && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Dato titulo="Platos en la carta" valor={r.productos} detalle={`${r.productosConReceta} con receta`} />
          <Dato
            titulo="Platos sin receta"
            valor={r.productosSinReceta}
            detalle={r.productosSinReceta > 0 ? 'les falta ficha técnica' : 'todos tienen ficha'}
            alerta={r.productosSinReceta > 0}
          />
          <Dato titulo="Insumos" valor={r.insumos} detalle={`${r.preparaciones} preparaciones`} />
          <Dato
            titulo="Insumos sin costo"
            valor={r.insumosSinCosto}
            detalle={r.insumosSinCosto > 0 ? 'hacen que la receta cueste 0' : 'todos con precio'}
            alerta={r.insumosSinCosto > 0}
          />
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-brand-950/5 p-1">
        {(
          [
            ['insumos', 'Insumos'],
            ['recetas', 'Recetas'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setPestana(valor)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              pestana === valor ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}

      {pestana === 'insumos' ? (
        <PanelInsumos
          restaurantId={restaurantId}
          estado={estado}
          onError={setError}
          onAviso={setAviso}
          onCargado={cargarEstado}
        />
      ) : (
        <PanelRecetas
          restaurantId={restaurantId}
          estado={estado}
          onError={setError}
          onAviso={setAviso}
          onCargado={cargarEstado}
        />
      )}
    </div>
  );
}

function Dato({ titulo, valor, detalle, alerta }: { titulo: string; valor: number; detalle: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerta ? 'border-amber-300 bg-amber-50' : 'border-brand-950/10'}`}>
      <p className="text-[11px] uppercase tracking-wide text-brand-950/40">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums text-brand-950">{valor}</p>
      <p className="text-[11px] font-light text-brand-950/50">{detalle}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------
 * Insumos
 * ------------------------------------------------------------------------------------- */

function PanelInsumos({
  restaurantId,
  estado,
  onError,
  onAviso,
  onCargado,
}: {
  restaurantId: string;
  estado: Estado | null;
  onError: (m: string | null) => void;
  onAviso: (m: string | null) => void;
  onCargado: () => Promise<void>;
}) {
  const [filas, setFilas] = useState<FilaInsumo[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  async function subir(file: File) {
    onError(null);
    onAviso(null);
    setLeyendo(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/leer-insumos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: AI_TIMEOUT_MS,
      });
      const leidos: {
        nombre: string;
        unidad: string;
        cantidad: number;
        costoUnitario: number;
        minimo: number;
        categoria: string;
        vinculadoA: { id: string; nombre: string; costoActual: number } | null;
        vinculoPor: 'nombre' | 'ia' | null;
        usadoEn: number;
      }[] = data.data?.insumos ?? [];
      const lectura: { filas: number; productos: number; lotes: number } | undefined = data.data?.lectura;
      setFilas(
        leidos.map((i, idx) => ({
          key: `ins-${Date.now()}-${idx}`,
          nombre: i.nombre,
          unidad: i.unidad,
          cantidad: i.cantidad,
          costoUnitario: i.costoUnitario,
          minimo: i.minimo,
          categoria: i.categoria,
          inventoryItemId: i.vinculadoA?.id ?? '',
          vinculoPor: i.vinculoPor,
          usadoEn: i.usadoEn,
        })),
      );
      onAviso(
        `Se leyeron ${leidos.length} insumos. Revisa los vínculos y carga.` +
          // Un inventario real trae una hoja por semana con los mismos insumos repetidos: se
          // dice qué se colapsó para que 2.888 filas convertidas en 171 no parezcan una pérdida.
          (lectura && lectura.filas > lectura.productos
            ? ` (El archivo traía ${lectura.filas} filas repetidas entre hojas; quedaron ${lectura.productos} productos distintos.)`
            : '') +
          (lectura && lectura.lotes > 1 ? ` Se leyó en ${lectura.lotes} tandas.` : ''),
      );
    } catch (e: any) {
      onError(e.response?.data?.error ?? 'No se pudo leer la lista de insumos.');
    } finally {
      setLeyendo(false);
    }
  }

  function editar(key: string, patch: Partial<FilaInsumo>) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  async function cargar() {
    onError(null);
    onAviso(null);
    setGuardando(true);
    try {
      const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/confirmar-insumos`, {
        insumos: filas
          .filter((f) => f.nombre.trim())
          .map((f) => ({
            nombre: f.nombre.trim(),
            unidad: f.unidad,
            cantidad: f.cantidad,
            costoUnitario: f.costoUnitario,
            minimo: f.minimo,
            categoria: f.categoria.trim() || undefined,
            inventoryItemId: f.inventoryItemId || undefined,
          })),
      });
      const d = data.data;
      onAviso(
        `${d.creados} insumo(s) creados y ${d.actualizados} actualizados, ${d.conCosto} con precio. ` +
          (d.lineasRecosteadas > 0
            ? `Se recostearon ${d.lineasRecosteadas} línea(s) de receta que ya existían.`
            : 'Ninguna receta cambió de costo.') +
          (d.unidadEnConflicto.length > 0
            ? ` Ojo: la unidad de la lista no coincide con la que ya tenían ${d.unidadEnConflicto.join(', ')} — se dejó la del sistema para no reinterpretar sus recetas.`
            : ''),
      );
      setFilas([]);
      await onCargado();
    } catch (e: any) {
      onError(e.response?.data?.error ?? 'No se pudieron cargar los insumos.');
    } finally {
      setGuardando(false);
    }
  }

  const nuevos = filas.filter((f) => !f.inventoryItemId).length;
  const sinCosto = estado?.insumos.filter((i) => i.costo <= 0) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm font-light text-brand-950/50">
        Sube el inventario del cliente, su lista de compras o la factura del proveedor —foto o Excel, como lo haya
        mandado. La IA saca cada insumo con su unidad, su existencia y su costo, y decide cuáles son los mismos que ya
        tiene cargados para vincularlos en vez de duplicarlos.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <TextureButton
          type="button"
          variant="brand"
          size="default"
          className="!w-auto"
          disabled={leyendo}
          onClick={() => archivoRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> {leyendo ? 'Leyendo la lista…' : 'Subir lista de insumos'}
        </TextureButton>
        <input
          ref={archivoRef}
          type="file"
          accept={ARCHIVOS}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
            e.target.value = '';
          }}
        />
        {filas.length > 0 && (
          <span className="text-sm text-brand-950/50">
            {filas.length - nuevos} se vinculan con insumos que ya tiene · {nuevos} se crean nuevos
          </span>
        )}
      </div>

      {filas.length === 0 && sinCosto.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            {sinCosto.length} insumo(s) sin costo — sus recetas están costando cero
          </p>
          <p className="mt-1 text-xs font-light text-amber-900/70">
            {sinCosto
              .slice(0, 12)
              .map((i) => `${i.nombre}${i.usadoEn > 0 ? ` (${i.usadoEn})` : ''}`)
              .join(', ')}
            {sinCosto.length > 12 ? `, y ${sinCosto.length - 12} más.` : '.'} El número entre paréntesis es en cuántas
            líneas de receta pega cargarle el precio.
          </p>
        </div>
      )}

      {filas.length > 0 && (
        <>
          <div className="space-y-2">
            {filas.map((f) => (
              <div key={f.key} className="rounded-xl border border-brand-950/10 p-3">
                <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                  <input
                    value={f.nombre}
                    onChange={(e) => editar(f.key, { nombre: e.target.value })}
                    className="w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setFilas((prev) => prev.filter((x) => x.key !== f.key))}
                    className="pt-2 text-brand-950/30 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Campo etiqueta="Existencia">
                    <input
                      value={f.cantidad}
                      onChange={(e) => editar(f.key, { cantidad: Number(e.target.value) || 0 })}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    />
                  </Campo>
                  <Campo etiqueta="Unidad">
                    <select
                      value={f.unidad}
                      onChange={(e) => editar(f.key, { unidad: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    >
                      {UNIDADES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Costo por unidad">
                    <input
                      value={f.costoUnitario}
                      onChange={(e) => editar(f.key, { costoUnitario: Number(e.target.value) || 0 })}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    />
                  </Campo>
                  <Campo etiqueta="Mínimo">
                    <input
                      value={f.minimo}
                      onChange={(e) => editar(f.key, { minimo: Number(e.target.value) || 0 })}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    />
                  </Campo>
                  <Campo etiqueta="Categoría">
                    <input
                      value={f.categoria}
                      onChange={(e) => editar(f.key, { categoria: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    />
                  </Campo>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-brand-950/50">Se carga sobre:</span>
                  <select
                    value={f.inventoryItemId}
                    onChange={(e) => editar(f.key, { inventoryItemId: e.target.value, vinculoPor: null })}
                    className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  >
                    <option value="">Crear un insumo nuevo</option>
                    {(estado?.insumos ?? []).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre} ({i.unidad}){i.usadoEn > 0 ? ` · ${i.usadoEn} línea(s)` : ''}
                      </option>
                    ))}
                  </select>
                  {f.vinculoPor === 'ia' && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      lo cruzó la IA — revísalo
                    </span>
                  )}
                  {f.vinculoPor === 'nombre' && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      mismo nombre
                    </span>
                  )}
                  {f.usadoEn > 0 && (
                    <span className="text-[11px] text-brand-950/50">recostea {f.usadoEn} línea(s)</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <TextureButton
            type="button"
            variant="accent"
            size="default"
            className="!w-auto"
            disabled={guardando}
            onClick={() => void cargar()}
          >
            {guardando ? 'Cargando…' : `Cargar ${filas.length} insumo(s) y recostear las recetas`}
          </TextureButton>
        </>
      )}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="text-[11px] text-brand-950/50">
      {etiqueta}
      {children}
    </label>
  );
}

/* ---------------------------------------------------------------------------------------
 * Recetas
 * ------------------------------------------------------------------------------------- */

function PanelRecetas({
  restaurantId,
  estado,
  onError,
  onAviso,
  onCargado,
}: {
  restaurantId: string;
  estado: Estado | null;
  onError: (m: string | null) => void;
  onAviso: (m: string | null) => void;
  onCargado: () => Promise<void>;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const sinReceta = estado?.productosSinReceta ?? [];

  function recibir(
    leidas: { productId?: string | null; nombre: string; yaTeniaReceta?: boolean; insumos?: LineaInsumo[]; preparaciones?: Preparacion[] }[],
  ) {
    setFilas(
      leidas.map((f, i) => ({
        key: `rec-${Date.now()}-${i}`,
        productId: f.productId ?? null,
        nombre: f.nombre,
        yaTeniaReceta: !!f.yaTeniaReceta,
        insumos: f.insumos ?? [],
        preparaciones: f.preparaciones ?? [],
      })),
    );
  }

  async function armarConIA() {
    if (seleccion.size === 0) {
      onError('Elige al menos un plato.');
      return;
    }
    onError(null);
    onAviso(null);
    setTrabajando('Armando las fichas técnicas con IA…');
    try {
      const { data } = await masterApi.post(
        `/master/catalog-ai/${restaurantId}/fichas-catalogo`,
        { productIds: [...seleccion] },
        { timeout: AI_TIMEOUT_MS },
      );
      recibir(data.data ?? []);
      onAviso(`${(data.data ?? []).length} ficha(s) listas para revisar.`);
    } catch (e: any) {
      onError(e.response?.data?.error ?? 'No se pudieron armar las fichas técnicas.');
    } finally {
      setTrabajando(null);
    }
  }

  async function subirRecetario(file: File) {
    onError(null);
    onAviso(null);
    setTrabajando('Leyendo el recetario…');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/leer-recetas`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: AI_TIMEOUT_MS,
      });
      const leidas = data.data ?? [];
      recibir(leidas);
      const huerfanas = leidas.filter((f: FilaReceta) => !f.productId).length;
      onAviso(
        `${leidas.length} receta(s) leídas.` +
          (huerfanas > 0
            ? ` ${huerfanas} no calzaron con ningún plato de la carta: corrige el nombre para que coincida, o cárgale antes ese plato.`
            : ''),
      );
    } catch (e: any) {
      onError(e.response?.data?.error ?? 'No se pudo leer el recetario.');
    } finally {
      setTrabajando(null);
    }
  }

  function editarFila(key: string, patch: Partial<FilaReceta>) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  async function cargar() {
    onError(null);
    onAviso(null);
    setGuardando(true);
    try {
      const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/confirmar-recetas`, {
        reemplazarExistentes: reemplazar,
        recetas: filas.map((f) => ({
          productId: f.productId ?? undefined,
          nombre: f.nombre.trim(),
          insumos: f.insumos
            .filter((g) => g.nombre.trim() && g.cantidad > 0)
            .map((g) => ({ nombre: g.nombre.trim(), unidad: g.unidad, cantidad: g.cantidad })),
          preparaciones: f.preparaciones
            .filter((pr) => pr.nombre.trim() && pr.rendimiento > 0 && pr.cantidad > 0)
            .map((pr) => ({
              nombre: pr.nombre.trim(),
              unidad: pr.unidad,
              rendimiento: pr.rendimiento,
              cantidad: pr.cantidad,
              insumos: pr.insumos
                .filter((g) => g.nombre.trim() && g.cantidad > 0)
                .map((g) => ({ nombre: g.nombre.trim(), unidad: g.unidad, cantidad: g.cantidad })),
            }))
            .filter((pr) => pr.insumos.length > 0),
        })),
      });
      const d = data.data;
      onAviso(
        `${d.recetasCargadas} receta(s) cargadas con ${d.lineasReceta} línea(s).` +
          (d.insumosCreados.length > 0
            ? ` Se crearon ${d.insumosCreados.length} insumo(s) sin costo: ${d.insumosCreados.join(', ')}.`
            : '') +
          (d.salteados.length > 0 ? ` Se saltaron (ya tenían receta): ${d.salteados.join(', ')}.` : '') +
          (d.sinPlato.length > 0 ? ` Sin plato en la carta: ${d.sinPlato.join(', ')}.` : ''),
      );
      setFilas([]);
      setSeleccion(new Set());
      await onCargado();
    } catch (e: any) {
      onError(e.response?.data?.error ?? 'No se pudieron cargar las recetas.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-light text-brand-950/50">
        Dos caminos. Si el cliente tiene su recetario, súbelo: esos son sus gramos de verdad. Si no lo tiene, elige los
        platos y la IA propone la ficha técnica de cada uno —una estimación de partida que el cliente después ajusta.
        En los dos casos se escribe <span className="font-medium">solo la receta</span>: nombre, precio y categoría del
        plato quedan como están.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <TextureButton
          type="button"
          variant="brand"
          size="default"
          className="!w-auto"
          disabled={!!trabajando}
          onClick={() => archivoRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> Subir el recetario del cliente
        </TextureButton>
        <input
          ref={archivoRef}
          type="file"
          accept={ARCHIVOS}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subirRecetario(f);
            e.target.value = '';
          }}
        />
        {trabajando && <span className="text-sm text-brand-950/50">{trabajando}</span>}
      </div>

      {sinReceta.length > 0 && filas.length === 0 && (
        <div className="rounded-xl border border-brand-950/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-brand-950">
              {sinReceta.length} plato(s) de su carta sin receta
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSeleccion(new Set(sinReceta.map((p) => p.id)))}
                className="text-xs font-medium text-brand-500 hover:text-brand-600"
              >
                Marcar todos
              </button>
              <button
                type="button"
                onClick={() => setSeleccion(new Set())}
                className="text-xs font-medium text-brand-950/40 hover:text-brand-950"
              >
                Ninguno
              </button>
            </div>
          </div>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {sinReceta.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={seleccion.has(p.id)}
                  onChange={(e) =>
                    setSeleccion((prev) => {
                      const s = new Set(prev);
                      if (e.target.checked) s.add(p.id);
                      else s.delete(p.id);
                      return s;
                    })
                  }
                />
                <span className="text-brand-950">{p.nombre}</span>
                {p.categoria && <span className="text-[11px] text-brand-950/40">{p.categoria}</span>}
              </label>
            ))}
          </div>
          <TextureButton
            type="button"
            variant="minimal"
            size="sm"
            className="mt-2 !w-auto"
            disabled={!!trabajando || seleccion.size === 0}
            onClick={() => void armarConIA()}
          >
            Armar la ficha técnica de {seleccion.size} plato(s) con IA
          </TextureButton>
        </div>
      )}

      {filas.length > 0 && (
        <>
          <div className="space-y-3">
            {filas.map((f) => (
              <EditorReceta
                key={f.key}
                fila={f}
                onChange={(patch) => editarFila(f.key, patch)}
                onQuitar={() => setFilas((prev) => prev.filter((x) => x.key !== f.key))}
              />
            ))}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={reemplazar}
              onChange={(e) => setReemplazar(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-brand-950">Reemplazar las recetas que ya existan</span>
              <span className="block text-[11px] font-light text-brand-950/40">
                Sin esto, un plato que ya tiene receta se salta y se te avisa. Márcalo solo si de verdad quieres pisar
                el trabajo que el cliente ya hizo.
              </span>
            </span>
          </label>

          <TextureButton
            type="button"
            variant="accent"
            size="default"
            className="!w-auto"
            disabled={guardando}
            onClick={() => void cargar()}
          >
            {guardando ? 'Cargando…' : `Cargar ${filas.length} receta(s)`}
          </TextureButton>
        </>
      )}
    </div>
  );
}

function EditorReceta({
  fila,
  onChange,
  onQuitar,
}: {
  fila: FilaReceta;
  onChange: (patch: Partial<FilaReceta>) => void;
  onQuitar: () => void;
}) {
  function editarInsumo(idx: number, patch: Partial<LineaInsumo>) {
    onChange({ insumos: fila.insumos.map((g, i) => (i === idx ? { ...g, ...patch } : g)) });
  }
  function editarPrep(idx: number, patch: Partial<Preparacion>) {
    onChange({ preparaciones: fila.preparaciones.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  }

  return (
    <div className="rounded-xl border border-brand-950/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={fila.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm font-medium"
        />
        {!fila.productId && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
            no calza con ningún plato
          </span>
        )}
        {fila.yaTeniaReceta && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            ya tiene receta
          </span>
        )}
        <button type="button" onClick={onQuitar} className="text-brand-950/30 hover:text-red-500">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-[11px] font-medium text-brand-950/50">Lleva:</p>
      <ul className="mt-1 space-y-1.5">
        {fila.insumos.map((g, i) => (
          <li key={i} className="grid grid-cols-[1fr_5rem_5.5rem_auto] items-center gap-2">
            <input
              value={g.nombre}
              onChange={(e) => editarInsumo(i, { nombre: e.target.value })}
              className="min-w-0 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
            />
            <input
              value={g.cantidad}
              onChange={(e) => editarInsumo(i, { cantidad: Number(e.target.value) || 0 })}
              inputMode="decimal"
              className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
            />
            <select
              value={g.unidad}
              onChange={(e) => editarInsumo(i, { unidad: e.target.value })}
              className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange({ insumos: fila.insumos.filter((_, x) => x !== i) })}
              className="text-brand-950/30 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange({ insumos: [...fila.insumos, { nombre: '', unidad: 'kg', cantidad: 0 }] })}
        className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-600"
      >
        <Plus className="h-3.5 w-3.5" /> Añadir ingrediente
      </button>

      {fila.preparaciones.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium text-brand-950/50">Preparaciones que usa:</p>
          {fila.preparaciones.map((pr, i) => (
            <div key={i} className="rounded-lg border border-brand-950/10 bg-brand-950/[0.02] p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={pr.nombre}
                  onChange={(e) => editarPrep(i, { nombre: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                />
                <span className="text-[10px] text-brand-950/40">
                  {pr.yaExiste ? 'ya la tiene' : 'preparación nueva'}
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ preparaciones: fila.preparaciones.filter((_, x) => x !== i) })}
                  className="text-brand-950/30 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Campo etiqueta="Rinde (una tanda)">
                  <input
                    value={pr.rendimiento}
                    onChange={(e) => editarPrep(i, { rendimiento: Number(e.target.value) || 0 })}
                    inputMode="decimal"
                    className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  />
                </Campo>
                <Campo etiqueta="Unidad">
                  <select
                    value={pr.unidad}
                    onChange={(e) => editarPrep(i, { unidad: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Usa este plato">
                  <input
                    value={pr.cantidad}
                    onChange={(e) => editarPrep(i, { cantidad: Number(e.target.value) || 0 })}
                    inputMode="decimal"
                    className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  />
                </Campo>
              </div>
              <ul className="mt-2 space-y-1.5">
                {pr.insumos.map((g, j) => (
                  <li key={j} className="grid grid-cols-[1fr_5rem_5.5rem_auto] items-center gap-2">
                    <input
                      value={g.nombre}
                      onChange={(e) =>
                        editarPrep(i, {
                          insumos: pr.insumos.map((x, y) => (y === j ? { ...x, nombre: e.target.value } : x)),
                        })
                      }
                      className="min-w-0 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                    />
                    <input
                      value={g.cantidad}
                      onChange={(e) =>
                        editarPrep(i, {
                          insumos: pr.insumos.map((x, y) =>
                            y === j ? { ...x, cantidad: Number(e.target.value) || 0 } : x,
                          ),
                        })
                      }
                      inputMode="decimal"
                      className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    />
                    <select
                      value={g.unidad}
                      onChange={(e) =>
                        editarPrep(i, {
                          insumos: pr.insumos.map((x, y) => (y === j ? { ...x, unidad: e.target.value } : x)),
                        })
                      }
                      className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    >
                      {UNIDADES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        editarPrep(i, { insumos: pr.insumos.filter((_, y) => y !== j) })
                      }
                      className="text-brand-950/30 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

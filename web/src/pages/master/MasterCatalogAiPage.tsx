import { useEffect, useRef, useState } from 'react';
import { Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { masterApi } from '@/api/client';
import type { ReactNode } from 'react';
import { TextureButton } from '@/components/ui/texture-button';
import CargaPorPartes from './CargaPorPartes';

/**
 * Carga asistida de catálogo (herramienta interna del equipo QuickTap).
 *
 * Se elige el cliente, se suben fotos de sus platos y la IA propone nombre, descripción,
 * ingredientes y cantidades aproximadas. El operador revisa plato por plato, corrige lo que
 * haga falta y recién ahí se escribe en el catálogo del cliente — nada toca la base antes de
 * "Cargar al catálogo".
 *
 * Lo que queda del lado del cliente son los pesos exactos: cuántos gramos de carne lleva SU
 * hamburguesa. Es lo único que no se puede sacar de una foto.
 */

interface Restaurante {
  id: string;
  name: string;
  businessType?: string | null;
}

interface Ingrediente {
  nombre: string;
  unidad: string;
  cantidad: number;
  yaExiste?: boolean;
}

interface Tamano {
  nombre: string;
  precio: string;
}

interface GrupoModificador {
  nombre: string;
  obligatorio: boolean;
  permiteVarias: boolean;
  /** Nombres de los tamaños en los que aplica. Vacío = en todos. */
  tamanos: string[];
  opciones: { nombre: string; precio: string }[];
}

/** Base que se prepara aparte y se reutiliza (salsa, masa, caldo). */
interface Preparacion {
  nombre: string;
  unidad: string;
  /** Cuánto rinde UNA tanda, en `unidad`. */
  rendimiento: number;
  /** Cuánto usa este plato, en `unidad`. */
  cantidad: number;
  /** Ingredientes de la TANDA entera, no de una porción. */
  insumos: Ingrediente[];
  yaExiste?: boolean;
}

interface Plato {
  /** Identificador local de la fila, para poder editarla y borrarla antes de guardar. */
  key: string;
  nombre: string;
  categoria: string;
  precio: string;
  descripcion: string;
  photoUrl: string;
  ingredientes: Ingrediente[];
  preparaciones: Preparacion[];
  tamanos: Tamano[];
  modificadores: GrupoModificador[];
}

const UNIDADES = [
  { value: 'kg', label: 'kg' },
  { value: 'lt', label: 'lt' },
  { value: 'unidad', label: 'unidad' },
];

export default function MasterCatalogAiPage() {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [mejorarFoto, setMejorarFoto] = useState(false);
  const [categoriaPorDefecto, setCategoriaPorDefecto] = useState('');
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>([]);
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [analizando, setAnalizando] = useState(0);
  const [leyendoCarta, setLeyendoCarta] = useState(false);
  const [armandoFichas, setArmandoFichas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cartaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    masterApi
      .get('/master/restaurants')
      // Solo restaurantes: esta carga arma platos con receta e insumos, que es el modelo de un
      // restaurante. Un local comercial o un club llevan su propio catálogo y no se cargan así.
      .then((res) => setRestaurantes((res.data.data ?? res.data).filter((r: Restaurante) => r.businessType === 'RESTAURANT')))
      .catch(() => setRestaurantes([]));
  }, []);

  /** Las categorías del cliente elegido, para colgar los platos de las suyas. */
  useEffect(() => {
    if (!restaurantId) {
      setCategorias([]);
      setCategoriaPorDefecto('');
      return;
    }
    masterApi
      .get(`/master/catalog-ai/${restaurantId}/categorias`)
      .then((res) => {
        const cats = res.data.data ?? [];
        setCategorias(cats);
        // Si ya tiene carta, se arranca por la primera suya; si no, hay que escribir una.
        setCategoriaPorDefecto(cats[0]?.name ?? '');
      })
      .catch(() => setCategorias([]));
  }, [restaurantId]);

  async function subirFotos(files: FileList) {
    if (!restaurantId) {
      setError('Elige primero a qué cliente se le va a cargar el catálogo.');
      return;
    }
    setError(null);
    setResultado(null);
    // Una por una y no en paralelo: son llamadas caras a Gemini y mandarle diez de golpe es
    // la forma más rápida de comerse el límite de la cuenta.
    for (const file of Array.from(files)) {
      setAnalizando((n) => n + 1);
      try {
        const form = new FormData();
        form.append('photo', file);
        form.append('mejorarFoto', String(mejorarFoto));
        const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/analizar`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const d = data.data;
        setPlatos((prev) => [
          ...prev,
          {
            key: `${Date.now()}-${Math.random()}`,
            nombre: d.plato || file.name.replace(/\.[^.]+$/, ''),
            categoria: categoriaPorDefecto,
            precio: '',
            descripcion: d.descripcion ?? '',
            photoUrl: d.photoUrl,
            ingredientes: d.ingredientes ?? [],
            preparaciones: [],
            tamanos: [],
            modificadores: [],
          },
        ]);
      } catch (e: any) {
        setError(e.response?.data?.error ?? `No se pudo analizar "${file.name}".`);
      } finally {
        setAnalizando((n) => n - 1);
      }
    }
  }

  /**
   * Carga masiva: una foto del menú impreso o el Excel del cliente, tal como lo mandó.
   *
   * Son dos pasos contra la IA a propósito. Primero LEER la carta (qué platos hay y a qué
   * precio) — eso es transcripción y se revisa de un vistazo. Después las FICHAS TÉCNICAS de
   * cada plato, que es estimación. Separados, un error de lectura no arrastra toda la ficha, y
   * el operador ve platos en pantalla apenas termina el primer paso en vez de esperar todo.
   */
  async function subirCarta(file: File) {
    if (!restaurantId) {
      setError('Elige primero a qué cliente se le va a cargar el catálogo.');
      return;
    }
    setError(null);
    setResultado(null);
    setLeyendoCarta(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/leer-carta`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const leidos: { nombre: string; categoria: string; precio: number; descripcion: string }[] = data.data ?? [];

      const nuevos: Plato[] = leidos.map((d, i) => ({
        key: `carta-${Date.now()}-${i}`,
        nombre: d.nombre,
        categoria: d.categoria || categoriaPorDefecto,
        precio: d.precio > 0 ? String(d.precio) : '',
        descripcion: d.descripcion ?? '',
        photoUrl: '',
        ingredientes: [],
        preparaciones: [],
        tamanos: [],
        modificadores: [],
      }));
      setPlatos((prev) => [...prev, ...nuevos]);
      setLeyendoCarta(false);
      setResultado(`Se leyeron ${nuevos.length} platos. Armando las fichas técnicas…`);
      await pedirFichas(nuevos);
      setResultado(`${nuevos.length} platos listos para revisar. Ajusta lo que haga falta y carga el catálogo.`);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo leer la carta.');
      setResultado(null);
    } finally {
      setLeyendoCarta(false);
      setArmandoFichas(false);
    }
  }

  /** Pide a la IA los insumos y preparaciones de una tanda de platos y los pega en su fila. */
  async function pedirFichas(objetivo: Plato[]) {
    const conNombre = objetivo.filter((p) => p.nombre.trim());
    if (conNombre.length === 0) return;
    setArmandoFichas(true);
    try {
      const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/fichas`, {
        platos: conNombre.map((p) => ({ nombre: p.nombre.trim(), descripcion: p.descripcion.trim() || undefined })),
      });
      const fichas: { nombre: string; insumos: Ingrediente[]; preparaciones: Preparacion[] }[] = data.data ?? [];
      // La IA devuelve el nombre que se le pasó, pero puede cambiarle mayúsculas o acentos:
      // se cruza por nombre normalizado para no perder la ficha por una tilde.
      const norm = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const porNombre = new Map(fichas.map((f) => [norm(f.nombre), f]));
      const claves = new Set(conNombre.map((p) => p.key));
      setPlatos((prev) =>
        prev.map((p) => {
          if (!claves.has(p.key)) return p;
          const f = porNombre.get(norm(p.nombre));
          if (!f) return p;
          return { ...p, ingredientes: f.insumos ?? [], preparaciones: f.preparaciones ?? [] };
        }),
      );
    } catch (e: any) {
      // La carta ya se leyó: se avisa pero no se borra lo cargado — el operador puede cargar
      // los platos sin ficha y completarlas después, que es mejor que perder la lectura.
      setError(e.response?.data?.error ?? 'Se leyeron los platos pero no se pudieron armar las fichas técnicas.');
    } finally {
      setArmandoFichas(false);
    }
  }

  function editarPlato(key: string, patch: Partial<Plato>) {
    setPlatos((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function editarIngrediente(key: string, idx: number, patch: Partial<Ingrediente>) {
    setPlatos((prev) =>
      prev.map((p) =>
        p.key === key ? { ...p, ingredientes: p.ingredientes.map((g, i) => (i === idx ? { ...g, ...patch } : g)) } : p,
      ),
    );
  }

  async function cargar() {
    setError(null);
    setResultado(null);
    // Con tamaños el precio del plato no se usa: cada tamaño lleva el suyo.
    const sinPrecio = platos.filter((p) => !p.precio.trim() && p.tamanos.length === 0);
    if (sinPrecio.length > 0) {
      setError(`Falta el precio en: ${sinPrecio.map((p) => p.nombre).join(', ')}.`);
      return;
    }
    const tamanoSinPrecio = platos.filter((p) => p.tamanos.some((t) => !t.precio.trim()));
    if (tamanoSinPrecio.length > 0) {
      setError(`Falta el precio de algún tamaño en: ${tamanoSinPrecio.map((p) => p.nombre).join(', ')}.`);
      return;
    }
    setGuardando(true);
    try {
      const { data } = await masterApi.post(`/master/catalog-ai/${restaurantId}/confirmar`, {
        productos: platos.map((p) => ({
          nombre: p.nombre.trim(),
          categoria: p.categoria.trim() || 'General',
          precio: Number(p.precio) || 0,
          descripcion: p.descripcion.trim() || undefined,
          photoUrl: p.photoUrl,
          ingredientes: p.ingredientes
            .filter((g) => g.nombre.trim() && g.cantidad > 0)
            .map((g) => ({ nombre: g.nombre.trim(), unidad: g.unidad, cantidad: g.cantidad })),
          // Una preparación sin ingredientes no se puede costear: el backend la rechaza, así
          // que se filtra acá en vez de hacer fallar la carga entera por una fila vacía.
          preparaciones: p.preparaciones
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
          tamanos: p.tamanos
            .filter((t) => t.nombre.trim())
            .map((t) => ({ nombre: t.nombre.trim(), precio: Number(t.precio) || 0 })),
          modificadores: p.modificadores
            .filter((g) => g.nombre.trim())
            .map((g) => ({
              nombre: g.nombre.trim(),
              obligatorio: g.obligatorio,
              permiteVarias: g.permiteVarias,
              // Solo los tamaños que siguen existiendo: si el operador renombró uno después de
              // marcarlo, mandarlo igual crearía un grupo acotado a algo que no existe.
              tamanos: g.tamanos.filter((n) => p.tamanos.some((t) => t.nombre.trim() === n)),
              opciones: g.opciones
                .filter((o) => o.nombre.trim())
                .map((o) => ({ nombre: o.nombre.trim(), precio: Number(o.precio) || 0 })),
            })),
        })),
      });
      const r = data.data;
      const creados: string[] = r.insumosCreados ?? [];
      setResultado(
        `${r.productosCreados} producto(s) creados, ${r.productosActualizados} actualizados y ` +
          `${r.lineasReceta} línea(s) de receta.` +
          (r.tamanosCreados ? ` ${r.tamanosCreados} tamaño(s).` : '') +
          (r.gruposCreados ? ` ${r.gruposCreados} grupo(s) de modificadores nuevos.` : '') +
          (creados.length > 0
            ? ` Se crearon ${creados.length} insumo(s) en su inventario: ${creados.join(', ')} — todos sin costo, para que el cliente cargue el suyo.`
            : ' No hizo falta crear ningún insumo nuevo.'),
      );
      setPlatos([]);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cargar el catálogo.');
    } finally {
      setGuardando(false);
    }
  }

  const cliente = restaurantes.find((r) => r.id === restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Carga de catálogo con IA</h1>
        <p className="mt-1 text-sm font-light text-brand-950/50">
          Sube las fotos de los platos de un cliente nuevo. La IA propone el nombre, la descripción y los ingredientes
          con cantidades aproximadas; tú revisas y cargas. El cliente solo tendrá que ajustar los pesos exactos.
        </p>
      </div>

      <Section title="1. Elige el cliente">
          <select
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
          >
            <option value="">Elige un cliente…</option>
            {restaurantes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-sm">
              <span className="text-xs text-brand-950/60">Categoría por defecto</span>
              <CategoriaPicker
                categorias={categorias}
                value={categoriaPorDefecto}
                onChange={setCategoriaPorDefecto}
                disabled={!restaurantId}
              />
              <span className="text-[11px] font-light text-brand-950/40">
                {categorias.length > 0
                  ? `Este cliente ya tiene ${categorias.length} categoría${categorias.length === 1 ? '' : 's'}. Se le pone a cada plato nuevo; puedes cambiarla plato por plato.`
                  : 'Este cliente todavía no tiene categorías: la que escribas se creará.'}
              </span>
            </div>
            <label className="flex items-start gap-2 self-start pt-5 text-sm">
              <input
                type="checkbox"
                checked={mejorarFoto}
                onChange={(e) => setMejorarFoto(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-brand-950">Mejorar la foto con IA</span>
                <span className="block text-[11px] font-light text-brand-950/40">
                  Rehace la foto como una fotografía de catálogo. Es la llamada cara: úsala solo cuando la foto del
                  cliente no sirva como está.
                </span>
              </span>
            </label>
          </div>
        </Section>

      <CargaPorPartes restaurantId={restaurantId} titulo="2. Cliente ya montado: cargarle solo lo que le falta" />

      <Section title="3. Cliente nuevo: carga la carta completa (foto del menú o Excel)">
          <p className="text-sm font-light text-brand-950/50">
            Sube una <span className="font-medium">foto del menú impreso</span> o el{' '}
            <span className="font-medium">Excel del cliente tal como lo mandó</span> — no hace falta
            plantilla. La IA saca los platos con su precio y categoría, y después arma la ficha
            técnica de cada uno: sus insumos y las preparaciones que se hacen aparte.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <TextureButton
              type="button"
              variant="brand"
              size="default"
              className="!w-auto"
              disabled={!restaurantId || leyendoCarta || armandoFichas}
              onClick={() => cartaRef.current?.click()}
            >
              <Upload className="h-4 w-4" />{' '}
              {leyendoCarta
                ? 'Leyendo la carta…'
                : armandoFichas
                  ? 'Armando fichas técnicas…'
                  : 'Subir carta o Excel'}
            </TextureButton>
            <input
              ref={cartaRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subirCarta(f);
                e.target.value = '';
              }}
            />
            {armandoFichas && (
              <span className="text-sm text-brand-950/50">
                Esto tarda: son varias consultas a la IA, una por cada tanda de platos.
              </span>
            )}
          </div>
          {platos.length > 0 && (
            <TextureButton
              type="button"
              variant="minimal"
              size="sm"
              className="!w-auto"
              disabled={leyendoCarta || armandoFichas}
              onClick={() => void pedirFichas(platos)}
            >
              Rehacer las fichas técnicas de los {platos.length} platos
            </TextureButton>
          )}
        </Section>

      <Section title="4. O sube fotos de platos, uno por uno">
          <div className="flex flex-wrap items-center gap-2">
            <TextureButton
              type="button"
              variant="brand"
              size="default"
              className="!w-auto"
              disabled={!restaurantId || analizando > 0}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> {analizando > 0 ? `Analizando… (${analizando})` : 'Subir fotos de platos'}
            </TextureButton>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void subirFotos(e.target.files);
                e.target.value = '';
              }}
            />
            {platos.length > 0 && (
              <span className="text-sm text-brand-950/50">
                {platos.length} plato{platos.length === 1 ? '' : 's'} listo{platos.length === 1 ? '' : 's'} para revisar
              </span>
            )}
          </div>
          {!restaurantId && <p className="text-xs text-brand-950/40">Elige un cliente para habilitar la subida.</p>}
        </Section>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {resultado && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✅ {resultado}</p>}

      {platos.length > 0 && (
        <>
          <Section title="4. Revisa lo que propuso la IA">
              <p className="text-sm font-light text-brand-950/50">
                Las cantidades son estimaciones a ojo, para que el cliente no arranque de cero. Corrige lo que esté mal
                y quita lo que sobre — nada se guarda hasta que le des a cargar.
              </p>
          </Section>

          {platos.map((p) => (
            <div key={p.key} className="space-y-3 rounded-2xl border border-brand-950/10 bg-white p-6 shadow-sm">
                <div className="flex gap-4">
                  <img src={p.photoUrl} alt="" className="h-28 w-28 shrink-0 rounded-xl object-cover" />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">Nombre</span>
                      <input
                        value={p.nombre}
                        onChange={(e) => editarPlato(p.key, { nombre: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="text-sm">
                      <span className="text-xs text-brand-950/60">Categoría</span>
                      <CategoriaPicker
                        categorias={categorias}
                        value={p.categoria}
                        onChange={(v) => editarPlato(p.key, { categoria: v })}
                      />
                    </div>
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">Precio de venta</span>
                      <input
                        value={p.precio}
                        onChange={(e) => editarPlato(p.key, { precio: e.target.value.replace(/[^0-9.]/g, '') })}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-xs text-brand-950/60">Descripción</span>
                      <textarea
                        value={p.descripcion}
                        onChange={(e) => editarPlato(p.key, { descripcion: e.target.value })}
                        rows={2}
                        className="mt-1 w-full resize-y rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlatos((prev) => prev.filter((x) => x.key !== p.key))}
                    title="Quitar este plato"
                    className="h-fit shrink-0 text-brand-950/30 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="rounded-xl border border-brand-950/10 p-3">
                  <p className="mb-2 text-sm font-medium text-brand-950/70">
                    Receta propuesta ({p.ingredientes.length} ingrediente{p.ingredientes.length === 1 ? '' : 's'})
                  </p>
                  <ul className="space-y-1.5">
                    {p.ingredientes.map((g, i) => (
                      <li key={i} className="grid grid-cols-[1fr_5rem_6rem_auto] items-center gap-2">
                        <input
                          value={g.nombre}
                          onChange={(e) => editarIngrediente(p.key, i, { nombre: e.target.value })}
                          className="min-w-0 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                        />
                        <input
                          value={g.cantidad}
                          onChange={(e) => editarIngrediente(p.key, i, { cantidad: Number(e.target.value) || 0 })}
                          inputMode="decimal"
                          className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                        />
                        <select
                          value={g.unidad}
                          onChange={(e) => editarIngrediente(p.key, i, { unidad: e.target.value })}
                          className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                        >
                          {UNIDADES.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                        <span className="flex items-center gap-1.5">
                          {/* Se avisa acá y no al guardar: es la diferencia entre vincular un
                              insumo que el cliente ya tiene y crearle uno nuevo. */}
                          {/* Se marcan los dos casos: sin la etiqueta de "nuevo" no se ve cuáles
                              insumos van a aparecerle al cliente en su inventario. */}
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              g.yaExiste ? 'bg-brand-500/10 text-brand-700' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {g.yaExiste ? 'ya lo tiene' : 'insumo nuevo'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              editarPlato(p.key, { ingredientes: p.ingredientes.filter((_, x) => x !== i) })
                            }
                            className="text-brand-950/30 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
                      editarPlato(p.key, {
                        ingredientes: [...p.ingredientes, { nombre: '', unidad: 'kg', cantidad: 0 }],
                      })
                    }
                    className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
                  >
                    <Plus className="h-4 w-4" /> Añadir ingrediente
                  </button>
                </div>

                {p.preparaciones.length > 0 && (
                  <PreparacionesDelPlato plato={p} onChange={(patch) => editarPlato(p.key, patch)} />
                )}

                <TamanosYModificadores plato={p} onChange={(patch) => editarPlato(p.key, patch)} />
              </div>
          ))}

          <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-950/10 bg-white/95 p-4 shadow-lg backdrop-blur">
            <TextureButton
              type="button"
              variant="brand"
              size="default"
              className="!w-auto disabled:opacity-50"
              disabled={guardando || analizando > 0}
              onClick={cargar}
            >
              <Sparkles className="h-4 w-4" />
              {guardando ? 'Cargando…' : `Cargar al catálogo de ${cliente?.name ?? 'el cliente'}`}
            </TextureButton>
            <TextureButton
              type="button"
              variant="minimal"
              size="default"
              className="!w-auto"
              disabled={guardando}
              onClick={() => setPlatos([])}
            >
              Descartar todo
            </TextureButton>
          </div>
        </>
      )}
    </div>
  );
}

/** Mismo contenedor que usan las demás pantallas del maestro, para que siga su tema. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-brand-950/10 bg-white p-6 shadow-sm">
      <p className="font-semibold text-brand-950">{title}</p>
      {children}
    </div>
  );
}

/**
 * Elegir una categoría del cliente, o escribir una nueva.
 *
 * Es un selector y no un campo libre porque escribir "Hamburguesas" a mano en un local que ya
 * tiene esa categoría le crea una segunda con el mismo nombre a la vista — el backend compara
 * sin acentos ni mayúsculas, pero "Hamburguesa" en singular ya es otra.
 */
function CategoriaPicker({
  categorias,
  value,
  onChange,
  disabled,
}: {
  categorias: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const esNueva = value !== '' && !categorias.some((c) => c.name === value);
  const [escribiendo, setEscribiendo] = useState(esNueva || categorias.length === 0);

  useEffect(() => {
    if (categorias.length === 0) setEscribiendo(true);
  }, [categorias.length]);

  if (escribiendo) {
    return (
      <div className="mt-1 flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej: Hamburguesas"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-3 py-2 text-sm disabled:opacity-50"
        />
        {categorias.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setEscribiendo(false);
              onChange(categorias[0].name);
            }}
            className="shrink-0 text-xs font-medium text-brand-500 hover:text-brand-600"
          >
            Usar una existente
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === '__nueva__') {
          setEscribiendo(true);
          onChange('');
          return;
        }
        onChange(e.target.value);
      }}
      className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm disabled:opacity-50"
    >
      {categorias.map((c) => (
        <option key={c.id} value={c.name}>
          {c.name}
        </option>
      ))}
      <option value="__nueva__">+ Crear una categoría nueva…</option>
    </select>
  );
}

/**
 * Tamaños y modificadores de un plato, dentro de la carga asistida.
 *
 * Van juntos y colapsados porque la mayoría de los platos no llevan ninguno de los dos, y
 * desplegarlos siempre convertía cada tarjeta en una pantalla entera. Los tamaños van primero
 * porque los grupos se acotan a ellos: no se puede decir "solo en la grande" antes de que la
 * grande exista.
 */
function TamanosYModificadores({ plato, onChange }: { plato: Plato; onChange: (patch: Partial<Plato>) => void }) {
  const [abierto, setAbierto] = useState(false);
  const resumen =
    plato.tamanos.length === 0 && plato.modificadores.length === 0
      ? 'ninguno'
      : [
          plato.tamanos.length ? `${plato.tamanos.length} tamaño${plato.tamanos.length === 1 ? '' : 's'}` : null,
          plato.modificadores.length
            ? `${plato.modificadores.length} grupo${plato.modificadores.length === 1 ? '' : 's'}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
      >
        <Plus className="h-4 w-4" /> Tamaños y modificadores ({resumen})
      </button>
    );
  }

  const nombresTamanos = plato.tamanos.map((t) => t.nombre.trim()).filter(Boolean);

  function editarGrupo(idx: number, patch: Partial<GrupoModificador>) {
    onChange({ modificadores: plato.modificadores.map((g, i) => (i === idx ? { ...g, ...patch } : g)) });
  }

  return (
    <div className="space-y-3 rounded-xl border border-brand-950/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-brand-950/70">Tamaños y modificadores</p>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-brand-950/40 hover:text-brand-950">
          Ocultar
        </button>
      </div>

      {/* --- Tamaños --- */}
      <div>
        <p className="text-xs text-brand-950/60">
          Tamaños {plato.tamanos.length > 0 && <span className="text-brand-950/40">— el precio de arriba deja de usarse</span>}
        </p>
        <ul className="mt-1 space-y-1.5">
          {plato.tamanos.map((t, i) => (
            <li key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
              <input
                value={t.nombre}
                onChange={(e) =>
                  onChange({ tamanos: plato.tamanos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })
                }
                placeholder="Ej: Grande"
                className="min-w-0 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
              />
              <input
                value={t.precio}
                onChange={(e) =>
                  onChange({
                    tamanos: plato.tamanos.map((x, j) =>
                      j === i ? { ...x, precio: e.target.value.replace(/[^0-9.]/g, '') } : x,
                    ),
                  })
                }
                placeholder="Precio"
                inputMode="decimal"
                className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => onChange({ tamanos: plato.tamanos.filter((_, j) => j !== i) })}
                className="text-brand-950/30 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onChange({ tamanos: [...plato.tamanos, { nombre: '', precio: '' }] })}
          className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          <Plus className="h-4 w-4" /> Añadir tamaño
        </button>
      </div>

      {/* --- Grupos de modificadores --- */}
      <div className="border-t border-brand-950/10 pt-3">
        <p className="text-xs text-brand-950/60">Grupos de modificadores</p>
        <div className="mt-1 space-y-3">
          {plato.modificadores.map((g, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-brand-950/[0.03] p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={g.nombre}
                  onChange={(e) => editarGrupo(i, { nombre: e.target.value })}
                  placeholder="Ej: Término de la carne"
                  className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => onChange({ modificadores: plato.modificadores.filter((_, j) => j !== i) })}
                  className="text-brand-950/30 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={g.obligatorio}
                    onChange={(e) => editarGrupo(i, { obligatorio: e.target.checked })}
                  />
                  Obligatorio
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={g.permiteVarias}
                    onChange={(e) => editarGrupo(i, { permiteVarias: e.target.checked })}
                  />
                  Permite varias
                </label>
              </div>

              {/* En qué tamaños se ofrece. Solo aparece si el plato tiene tamaños: sin ellos no
                  hay entre qué elegir y el grupo va en el plato entero. */}
              {nombresTamanos.length > 0 && (
                <div>
                  <span className="text-[11px] text-brand-950/40">¿En qué tamaños?</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => editarGrupo(i, { tamanos: [] })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        g.tamanos.length === 0
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-brand-950/15 text-brand-950/60'
                      }`}
                    >
                      Todos
                    </button>
                    {nombresTamanos.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          editarGrupo(i, {
                            tamanos: g.tamanos.includes(n) ? g.tamanos.filter((x) => x !== n) : [...g.tamanos, n],
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          g.tamanos.includes(n)
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-brand-950/15 text-brand-950/60'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <ul className="space-y-1.5">
                {g.opciones.map((o, k) => (
                  <li key={k} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
                    <input
                      value={o.nombre}
                      onChange={(e) =>
                        editarGrupo(i, {
                          opciones: g.opciones.map((x, j) => (j === k ? { ...x, nombre: e.target.value } : x)),
                        })
                      }
                      placeholder="Ej: Término medio"
                      className="min-w-0 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                    />
                    <input
                      value={o.precio}
                      onChange={(e) =>
                        editarGrupo(i, {
                          opciones: g.opciones.map((x, j) =>
                            j === k ? { ...x, precio: e.target.value.replace(/[^0-9.]/g, '') } : x,
                          ),
                        })
                      }
                      placeholder="+ precio"
                      inputMode="decimal"
                      className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => editarGrupo(i, { opciones: g.opciones.filter((_, j) => j !== k) })}
                      className="text-brand-950/30 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => editarGrupo(i, { opciones: [...g.opciones, { nombre: '', precio: '' }] })}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-600"
              >
                <Plus className="h-3.5 w-3.5" /> Añadir opción
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              modificadores: [
                ...plato.modificadores,
                { nombre: '', obligatorio: false, permiteVarias: false, tamanos: [], opciones: [] },
              ],
            })
          }
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          <Plus className="h-4 w-4" /> Añadir grupo de modificadores
        </button>
      </div>
    </div>
  );
}


/**
 * Preparaciones propuestas para un plato: las bases que se hacen aparte (salsas, masas,
 * caldos) con sus propios ingredientes.
 *
 * La distinción que hay que tener clara al revisar, y por eso está escrita en pantalla: el
 * `rendimiento` y los ingredientes son de UNA TANDA entera, mientras que `cantidad` es lo que
 * se lleva este plato. Confundirlos es el error que haría que una salsa para 2 litros se cargue
 * como si cada plato usara 2 litros.
 */
function PreparacionesDelPlato({ plato, onChange }: { plato: Plato; onChange: (patch: Partial<Plato>) => void }) {
  function editar(idx: number, patch: Partial<Preparacion>) {
    onChange({ preparaciones: plato.preparaciones.map((pr, i) => (i === idx ? { ...pr, ...patch } : pr)) });
  }
  function editarInsumo(idx: number, j: number, patch: Partial<Ingrediente>) {
    onChange({
      preparaciones: plato.preparaciones.map((pr, i) =>
        i === idx ? { ...pr, insumos: pr.insumos.map((g, x) => (x === j ? { ...g, ...patch } : g)) } : pr,
      ),
    });
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <p className="text-sm font-medium text-violet-900">
        Preparaciones ({plato.preparaciones.length})
      </p>
      <p className="mb-2 text-[11px] font-light text-violet-900/60">
        Bases que se preparan aparte y se reutilizan. El rendimiento y sus ingredientes son de una
        tanda completa; abajo se indica cuánto usa este plato.
      </p>

      <div className="space-y-3">
        {plato.preparaciones.map((pr, i) => (
          <div key={i} className="rounded-lg border border-violet-200 bg-white p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={pr.nombre}
                onChange={(e) => editar(i, { nombre: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm font-medium"
              />
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  pr.yaExiste ? 'bg-brand-500/10 text-brand-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {pr.yaExiste ? 'ya la tiene' : 'preparación nueva'}
              </span>
              <button
                type="button"
                onClick={() => onChange({ preparaciones: plato.preparaciones.filter((_, x) => x !== i) })}
                className="text-brand-950/30 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-brand-950/50">
                Rinde (una tanda)
                <input
                  value={pr.rendimiento}
                  onChange={(e) => editar(i, { rendimiento: Number(e.target.value) || 0 })}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-[11px] text-brand-950/50">
                Unidad
                <select
                  value={pr.unidad}
                  onChange={(e) => editar(i, { unidad: e.target.value })}
                  className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                >
                  {UNIDADES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-brand-950/50">
                Usa este plato
                <input
                  value={pr.cantidad}
                  onChange={(e) => editar(i, { cantidad: Number(e.target.value) || 0 })}
                  inputMode="decimal"
                  className="mt-0.5 w-full rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <p className="mt-2 text-[11px] font-medium text-brand-950/50">Lleva (para la tanda):</p>
            <ul className="mt-1 space-y-1.5">
              {pr.insumos.map((g, j) => (
                <li key={j} className="grid grid-cols-[1fr_5rem_5.5rem_auto] items-center gap-2">
                  <input
                    value={g.nombre}
                    onChange={(e) => editarInsumo(i, j, { nombre: e.target.value })}
                    className="min-w-0 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                  />
                  <input
                    value={g.cantidad}
                    onChange={(e) => editarInsumo(i, j, { cantidad: Number(e.target.value) || 0 })}
                    inputMode="decimal"
                    className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  />
                  <select
                    value={g.unidad}
                    onChange={(e) => editarInsumo(i, j, { unidad: e.target.value })}
                    className="rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => editar(i, { insumos: pr.insumos.filter((_, x) => x !== j) })}
                    className="text-brand-950/30 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => editar(i, { insumos: [...pr.insumos, { nombre: '', unidad: 'kg', cantidad: 0 }] })}
              className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-600"
            >
              <Plus className="h-3.5 w-3.5" /> Añadir ingrediente a la preparación
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

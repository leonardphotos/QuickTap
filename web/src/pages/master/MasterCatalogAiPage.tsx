import { useEffect, useRef, useState } from 'react';
import { Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { masterApi } from '@/api/client';
import type { ReactNode } from 'react';
import { TextureButton } from '@/components/ui/texture-button';

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

interface Plato {
  /** Identificador local de la fila, para poder editarla y borrarla antes de guardar. */
  key: string;
  nombre: string;
  categoria: string;
  precio: string;
  descripcion: string;
  photoUrl: string;
  ingredientes: Ingrediente[];
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
  const [categoriaPorDefecto, setCategoriaPorDefecto] = useState('General');
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [analizando, setAnalizando] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    masterApi
      .get('/master/restaurants')
      .then((res) => setRestaurantes(res.data.data ?? res.data))
      .catch(() => setRestaurantes([]));
  }, []);

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
          },
        ]);
      } catch (e: any) {
        setError(e.response?.data?.error ?? `No se pudo analizar "${file.name}".`);
      } finally {
        setAnalizando((n) => n - 1);
      }
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
    const sinPrecio = platos.filter((p) => !p.precio.trim());
    if (sinPrecio.length > 0) {
      setError(`Falta el precio en: ${sinPrecio.map((p) => p.nombre).join(', ')}.`);
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
        })),
      });
      const r = data.data;
      setResultado(
        `${r.productosCreados} producto(s) creados, ${r.productosActualizados} actualizados, ` +
          `${r.insumosCreados} insumo(s) nuevos y ${r.lineasReceta} línea(s) de receta.`,
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
            <label className="block text-sm">
              <span className="text-xs text-brand-950/60">Categoría por defecto</span>
              <input
                value={categoriaPorDefecto}
                onChange={(e) => setCategoriaPorDefecto(e.target.value)}
                placeholder="Ej: Hamburguesas"
                className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
              />
              <span className="text-[11px] font-light text-brand-950/40">
                Se le pone a cada plato nuevo; puedes cambiarla plato por plato.
              </span>
            </label>
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

      <Section title="2. Sube las fotos">
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
          <Section title="3. Revisa lo que propuso la IA">
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
                    <label className="block text-sm">
                      <span className="text-xs text-brand-950/60">Categoría</span>
                      <input
                        value={p.categoria}
                        onChange={(e) => editarPlato(p.key, { categoria: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm"
                      />
                    </label>
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
                          {g.yaExiste && (
                            <span className="whitespace-nowrap rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                              ya lo tiene
                            </span>
                          )}
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

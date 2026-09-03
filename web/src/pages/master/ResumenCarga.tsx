import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Resumen visual de lo que la IA propuso, antes de que se escriba nada.
 *
 * La lista de fichas plato por plato dice QUÉ lleva cada uno, pero no responde la pregunta con
 * la que se aprueba una carga: qué va a cambiar en la base del cliente. Sobre todo al revés —
 * "este insumo nuevo, ¿de dónde salió y en qué platos se va a usar?" — que es donde se cachan
 * los inventos: un "Caldo dashi concentrado" que aparece en un solo plato casi siempre es la
 * IA adornando, y uno que aparece en nueve es real.
 */

export interface LineaResumen {
  nombre: string;
  unidad: string;
  cantidad: number;
  yaExiste?: boolean;
}

export interface PreparacionResumen {
  nombre: string;
  unidad: string;
  rendimiento: number;
  cantidad: number;
  insumos: LineaResumen[];
  yaExiste?: boolean;
}

export interface RecetaResumen {
  key: string;
  nombre: string;
  productId: string | null;
  yaTeniaReceta: boolean;
  incluir: boolean;
  insumos: LineaResumen[];
  preparaciones: PreparacionResumen[];
}

/** Dónde se usa un insumo: en qué platos directo y a través de qué preparaciones. */
interface Uso {
  unidad: string;
  directoEn: string[];
  viaPreparacion: Map<string, string[]>;
}

function indexarUsos(recetas: RecetaResumen[]) {
  const usos = new Map<string, Uso>();
  const tocar = (nombre: string, unidad: string) => {
    const k = nombre.trim().toLowerCase();
    if (!usos.has(k)) usos.set(k, { unidad, directoEn: [], viaPreparacion: new Map() });
    return usos.get(k)!;
  };

  for (const r of recetas) {
    if (!r.incluir) continue;
    for (const i of r.insumos) {
      if (!i.nombre.trim()) continue;
      tocar(i.nombre, i.unidad).directoEn.push(r.nombre);
    }
    for (const p of r.preparaciones) {
      for (const i of p.insumos) {
        if (!i.nombre.trim()) continue;
        const uso = tocar(i.nombre, i.unidad);
        const platos = uso.viaPreparacion.get(p.nombre) ?? [];
        platos.push(r.nombre);
        uso.viaPreparacion.set(p.nombre, platos);
      }
    }
  }
  return usos;
}

/** "Salsa boloñesa → Lasaña, Canelones" en una línea legible. */
function describirUso(uso: Uso): string {
  const partes: string[] = [];
  if (uso.directoEn.length > 0) partes.push(uso.directoEn.join(', '));
  for (const [prep, platos] of uso.viaPreparacion) partes.push(`${prep} → ${platos.join(', ')}`);
  return partes.join('  ·  ');
}

export function ResumenRecetas({ recetas }: { recetas: RecetaResumen[] }) {
  const [abierto, setAbierto] = useState(true);
  const incluidas = recetas.filter((r) => r.incluir);

  const lineas = incluidas.reduce((a, r) => a + r.insumos.length + r.preparaciones.length, 0);
  const usos = indexarUsos(recetas);

  // Lo que NO existe todavía: es lo único que va a aparecer de la nada en el inventario del
  // cliente, así que es lo que de verdad hay que mirar antes de aprobar.
  const insumosNuevos = new Map<string, Uso & { nombre: string }>();
  for (const r of incluidas) {
    for (const i of [...r.insumos, ...r.preparaciones.flatMap((p) => p.insumos)]) {
      const k = i.nombre.trim().toLowerCase();
      if (i.yaExiste || !k || insumosNuevos.has(k)) continue;
      const uso = usos.get(k);
      if (uso) insumosNuevos.set(k, { ...uso, nombre: i.nombre.trim() });
    }
  }
  const prepsNuevas = new Map<string, { nombre: string; unidad: string; rendimiento: number; platos: string[] }>();
  for (const r of incluidas) {
    for (const p of r.preparaciones) {
      if (p.yaExiste) continue;
      const k = p.nombre.trim().toLowerCase();
      const previo = prepsNuevas.get(k);
      if (previo) previo.platos.push(r.nombre);
      else prepsNuevas.set(k, { nombre: p.nombre, unidad: p.unidad, rendimiento: p.rendimiento, platos: [r.nombre] });
    }
  }

  const descartadas = recetas.length - incluidas.length;

  return (
    <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02]">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {abierto ? <ChevronDown className="h-4 w-4 text-brand-950/40" /> : <ChevronRight className="h-4 w-4 text-brand-950/40" />}
        <span className="text-sm font-semibold text-brand-950">Lo que se va a cargar</span>
        <span className="text-xs font-light text-brand-950/50">
          {incluidas.length} receta{incluidas.length === 1 ? '' : 's'} · {lineas} línea{lineas === 1 ? '' : 's'} ·{' '}
          {insumosNuevos.size} insumo{insumosNuevos.size === 1 ? '' : 's'} nuevo{insumosNuevos.size === 1 ? '' : 's'} ·{' '}
          {prepsNuevas.size} preparación{prepsNuevas.size === 1 ? '' : 'es'} nueva{prepsNuevas.size === 1 ? '' : 's'}
          {descartadas > 0 ? ` · ${descartadas} descartada${descartadas === 1 ? '' : 's'}` : ''}
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-brand-950/10 px-3 py-3">
          {prepsNuevas.size > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
                Preparaciones nuevas ({prepsNuevas.size})
              </p>
              <ul className="mt-1 space-y-1">
                {[...prepsNuevas.values()].map((p) => (
                  <li key={p.nombre} className="grid grid-cols-[1fr_auto] items-baseline gap-2 text-xs">
                    <span className="truncate text-brand-950">
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-brand-950/40"> — rinde {p.rendimiento} {p.unidad}</span>
                    </span>
                    <span className="truncate text-right text-brand-950/50">la usan: {p.platos.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insumosNuevos.size > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
                Insumos que no existen y se van a crear ({insumosNuevos.size})
              </p>
              <ul className="mt-1 space-y-1">
                {[...insumosNuevos.values()].map((i) => (
                  <li key={i.nombre} className="grid grid-cols-[1fr_1.6fr] items-baseline gap-2 text-xs">
                    <span className="truncate text-brand-950">
                      <span className="font-medium">{i.nombre}</span>
                      <span className="text-brand-950/40"> ({i.unidad})</span>
                    </span>
                    <span className="truncate text-brand-950/50" title={describirUso(i)}>
                      {describirUso(i)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] font-light text-brand-950/40">
                Entran sin costo y sin stock: el precio de compra es del cliente. Un insumo que aparece en un solo
                plato y suena raro suele ser la IA adornando — bórralo de esa ficha y no se crea.
              </p>
            </div>
          ) : (
            <p className="text-xs font-light text-brand-950/50">
              No hace falta crear ningún insumo: todo lo que llevan estas recetas ya está en su inventario.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Marca "ya existe" / "se creará" de una línea, que es la mitad de la revisión. */
export function MarcaExiste({ yaExiste, nuevoEs = 'se creará' }: { yaExiste?: boolean; nuevoEs?: string }) {
  return yaExiste ? (
    <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-800">
      ya existe
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-800">{nuevoEs}</span>
  );
}

/* ---------------------------------------------------------------------------------------
 * Insumos
 * ------------------------------------------------------------------------------------- */

export interface InsumoResumen {
  key: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  tipoEmpaque: string;
  inventoryItemId: string;
  vinculoPor: 'nombre' | 'ia' | null;
  usadoEn: number;
  enPlatos: string[];
  enPreparaciones: string[];
  incluir: boolean;
}

/**
 * Resumen de la carga de insumos, antes de escribir.
 *
 * Lo importante no es cuántos son sino qué toca cada uno: un vínculo lleva el precio nuevo a
 * TODAS las recetas del insumo con el que se emparejó, así que la fila que hay que mirar dos
 * veces es la que cae en catorce platos, no la que no cae en ninguno.
 */
export function ResumenInsumos({ insumos }: { insumos: InsumoResumen[] }) {
  const [abierto, setAbierto] = useState(true);
  const incluidos = insumos.filter((i) => i.incluir);

  const vinculados = incluidos.filter((i) => i.inventoryItemId);
  const nuevos = incluidos.length - vinculados.length;
  const conCosto = incluidos.filter((i) => i.costoUnitario > 0).length;
  const empaques = incluidos.filter((i) => i.tipoEmpaque).length;
  const lineas = vinculados.reduce((a, i) => a + i.usadoEn, 0);
  // Los que de verdad mueven algo: vinculados, con precio y usados en alguna receta.
  const conImpacto = vinculados
    .filter((i) => i.costoUnitario > 0 && i.usadoEn > 0)
    .sort((a, b) => b.usadoEn - a.usadoEn);
  const descartados = insumos.length - incluidos.length;

  return (
    <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02]">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {abierto ? <ChevronDown className="h-4 w-4 text-brand-950/40" /> : <ChevronRight className="h-4 w-4 text-brand-950/40" />}
        <span className="text-sm font-semibold text-brand-950">Lo que se va a cargar</span>
        <span className="text-xs font-light text-brand-950/50">
          {vinculados.length} se vinculan · {nuevos} se crean · {conCosto} con precio · {empaques} empaque
          {empaques === 1 ? '' : 's'} · {lineas} línea{lineas === 1 ? '' : 's'} de receta se recostean
          {descartados > 0 ? ` · ${descartados} descartado${descartados === 1 ? '' : 's'}` : ''}
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-brand-950/10 px-3 py-3">
          {conImpacto.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
                Precios que van a llegar a una receta ({conImpacto.length})
              </p>
              <ul className="mt-1 space-y-1">
                {conImpacto.map((i) => (
                  <li key={i.key} className="grid grid-cols-[1fr_1.6fr] items-baseline gap-2 text-xs">
                    <span className="truncate text-brand-950">
                      <span className="font-medium">{i.nombre}</span>
                      <span className="text-brand-950/40">
                        {' '}
                        {i.costoUnitario}/{i.unidad}
                      </span>
                    </span>
                    <span
                      className="truncate text-brand-950/50"
                      title={[...i.enPreparaciones.map((p) => `${p} (preparación)`), ...i.enPlatos].join(', ')}
                    >
                      {[...i.enPreparaciones.map((p) => `${p} (prep.)`), ...i.enPlatos].join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs font-light text-brand-950/50">
              Ninguno de estos precios llega a una receta todavía: o son insumos nuevos, o los que ya existían no se
              usan en ningún plato.
            </p>
          )}

          {empaques > 0 && (
            <p className="text-xs font-light text-brand-950/50">
              <span className="font-medium text-brand-950/70">{empaques} van a la ventana de empaques:</span>{' '}
              {incluidos
                .filter((i) => i.tipoEmpaque)
                .map((i) => i.nombre)
                .join(', ')}
              . Después, en la pestaña Empaques, se le asigna a cada plato el suyo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

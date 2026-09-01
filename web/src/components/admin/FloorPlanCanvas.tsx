import { useEffect, useRef, useState } from 'react';
import { BellRing, Circle, Link2, Link2Off, Minus, Plus, RectangleHorizontal, Receipt, Save, Square, X } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { seatOffsets } from './seat-layout';
import type { FloorPlanTable } from '@/types';

/**
 * Planimetría del salón: dibuja las mesas de una zona donde de verdad están en el local.
 *
 * Las posiciones se guardan en PORCENTAJE del lienzo (0-100), no en píxeles: el mismo plano
 * se ve igual en el celular del mesero y en el monitor de caja. En modo edición las mesas se
 * arrastran, cambian de forma (redonda/cuadrada) y de tamaño; en modo normal se comportan
 * como los botones de siempre — un toque abre la mesa.
 *
 * Es un componente CONTROLADO: los cambios sin guardar viven en la pantalla que lo usa, no acá.
 * Así no se pierden al desmontar el lienzo (ej. al cambiar de pestaña de zona) mientras el botón
 * "Guardar plano" sigue marcado como sucio.
 */

export interface FloorPlanPatch {
  id: string;
  planX: number | null;
  planY: number | null;
  planShape?: 'ROUND' | 'SQUARE' | 'RECTANGLE';
  planSize?: number;
  seats?: number;
}

/** Rango de sillas por mesa — mismo tope que valida el backend en saveFloorPlanSchema. */
export const MIN_SEATS = 1;
export const MAX_SEATS = 20;

/** Qué está haciendo el lienzo: mirar, reacomodar el plano, o elegir mesas para unirlas. */
export type FloorPlanMode = 'view' | 'edit' | 'merge';

/** Estado de una mesa, en abstracto. El color concreto lo pone quien la dibuja (claro/oscuro). */
export type TableToneKey = 'call' | 'multi' | 'occupied' | 'reserved' | 'vacant';

/** Estado de la mesa — mismo criterio que la vista de lista. */
export function tableToneKey(t: FloorPlanTable): TableToneKey {
  if (t.serviceRequest) return 'call';
  if (t.sessions.length > 1) return 'multi';
  if (t.sessions.length === 1) return 'occupied';
  if (t.reserved) return 'reserved';
  return 'vacant';
}

export function tableToneLabel(t: FloorPlanTable): string {
  switch (tableToneKey(t)) {
    case 'call':
      return 'Cuenta';
    case 'multi':
      return `${t.sessions.length} cuentas`;
    case 'occupied':
      return 'Ocupada';
    case 'reserved':
      return 'Reservada';
    default:
      return 'Libre';
  }
}

/** Paleta del panel claro (la de siempre). El plano oscuro de Sala usa la suya. */
const LIGHT_TONES: Record<TableToneKey, { bg: string; fg: string }> = {
  call: { bg: '#fbedd6', fg: '#8a5106' },
  multi: { bg: '#dfe3ea', fg: '#0b1524' },
  occupied: { bg: '#dfe3ea', fg: '#0b1524' },
  reserved: { bg: '#fbe7f1', fg: '#9d2469' },
  vacant: { bg: '#e3f5ec', fg: '#0f6e46' },
};

function tableTone(t: FloorPlanTable): { bg: string; fg: string; label: string } {
  return { ...LIGHT_TONES[tableToneKey(t)], label: tableToneLabel(t) };
}

export function FloorPlanCanvas({
  tables,
  mode,
  patches,
  onPatch,
  onOpenTable,
  onAcknowledge,
  onMerge,
  onUnmerge,
}: {
  tables: FloorPlanTable[];
  mode: FloorPlanMode;
  /** Cambios sin guardar, por id de mesa — los guarda la pantalla, no el lienzo. */
  patches: Record<string, FloorPlanPatch>;
  onPatch: (patch: FloorPlanPatch) => void;
  onOpenTable: (t: FloorPlanTable) => void;
  /** Botón rápido de "atender llamado/cuenta" sobre la mesa, sin abrir el diálogo completo. */
  onAcknowledge?: (t: FloorPlanTable) => void;
  /** Unir mesas: el lienzo elige las mesas y calcula dónde acoplarlas; la pantalla llama a la API. */
  onMerge?: (primaryTableId: string, tableIds: string[], positions: { id: string; planX: number; planY: number }[]) => void;
  onUnmerge?: (primaryTableId: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editing = mode === 'edit';
  const merging = mode === 'merge';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Modo unir: qué mesas van al grupo. La primera elegida es la que lleva la cuenta por defecto.
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  // Tamaño real del lienzo en píxeles: hace falta para mezclar las posiciones (que son %) con
  // los tamaños de mesa (que son px) al dibujar la cápsula del grupo y al acoplar.
  const [canvasPx, setCanvasPx] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setCanvasPx({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Salir del modo unir limpia la selección para no arrastrarla a la próxima vez.
  useEffect(() => {
    if (!merging) {
      setMergeIds([]);
      setPrimaryId(null);
    }
  }, [merging]);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  // Zoom de la VISTA, no del dato: solo escala cuánto se ven las mesas en pantalla (no toca
  // planX/planY/planSize, que siguen siendo % del lienzo y el tamaño real de cada mesa). Alejar
  // (zoom < 1) las encoge para que quepan más sin taparse; acercar (zoom > 1) las agranda para
  // ubicarlas con precisión. Vista local de esta pantalla, no se guarda.
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;

  const merged = tables.map((t) => {
    const d = patches[t.id];
    return d
      ? {
          ...t,
          planX: d.planX,
          planY: d.planY,
          planShape: d.planShape ?? t.planShape,
          planSize: d.planSize ?? t.planSize,
          seats: d.seats ?? t.seats,
        }
      : t;
  });
  const placed = merged.filter((t) => t.planX != null && t.planY != null);
  const unplaced = merged.filter((t) => t.planX == null || t.planY == null);

  function patch(id: string, changes: Partial<FloorPlanPatch>) {
    const base = tables.find((t) => t.id === id);
    const current = patches[id] ?? { id, planX: base?.planX ?? null, planY: base?.planY ?? null };
    onPatch({ ...current, ...changes });
  }

  /** Convierte la posición del puntero a % del lienzo, recortado al borde. */
  function pointToPercent(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    // Margen amplio porque el lienzo recorta y las sillas sobresalen del borde de la mesa:
    // pegada al borde exacto, la mesa perdería la fila de sillas de ese lado.
    return { x: Math.min(93, Math.max(7, x)), y: Math.min(91, Math.max(9, y)) };
  }

  /**
   * Arrastre con listeners en `window` (no en el propio botón): así el movimiento se sigue
   * aunque el dedo/cursor se salga del lienzo, y funciona igual con ratón, dedo o lápiz.
   */
  function startDrag(e: React.PointerEvent | React.MouseEvent, t: FloorPlanTable) {
    if (!editing) return;
    e.preventDefault();
    draggingRef.current = { id: t.id, offsetX: 0, offsetY: 0 };
    setSelectedId(t.id);

    const move = (ev: PointerEvent | MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const { x, y } = pointToPercent(ev.clientX, ev.clientY);
      patch(drag.id, { planX: Math.round(x * 10) / 10, planY: Math.round(y * 10) / 10 });
    };
    const end = () => {
      draggingRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('mouseup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('mousemove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('mouseup', end);
  }

  const selected = selectedId ? merged.find((t) => t.id === selectedId) : null;

  /** Ancho/alto en píxeles con que se dibuja una mesa (la rectangular es el doble de ancha). */
  function dims(t: FloorPlanTable) {
    const size = 56 * (t.planSize || 1) * zoom;
    return { width: t.planShape === 'RECTANGLE' ? size * 2 : size, height: size };
  }

  const byId = new Map(merged.map((t) => [t.id, t]));
  // Mesas que están pegadas a otra: no se dibujan solas, quedan dentro de la cápsula del grupo.
  const memberIds = new Set(merged.filter((t) => t.mergedIntoTableId).map((t) => t.id));

  /**
   * Caja que envuelve a una mesa principal y sus miembros: es lo que se dibuja como UNA sola
   * mesa. Devuelve el centro en % (para posicionarla como cualquier otra) y el tamaño en px.
   */
  function groupBox(primary: FloorPlanTable) {
    const group = [primary, ...primary.mergedTableIds.map((id) => byId.get(id)).filter(Boolean as unknown as (t: FloorPlanTable | undefined) => t is FloorPlanTable)];
    const placedGroup = group.filter((t) => t.planX != null && t.planY != null);
    if (canvasPx.w === 0 || placedGroup.length === 0) return null;

    const bounds = placedGroup.reduce(
      (acc, t) => {
        const { width, height } = dims(t);
        const cx = ((t.planX as number) / 100) * canvasPx.w;
        const cy = ((t.planY as number) / 100) * canvasPx.h;
        return {
          minX: Math.min(acc.minX, cx - width / 2),
          maxX: Math.max(acc.maxX, cx + width / 2),
          minY: Math.min(acc.minY, cy - height / 2),
          maxY: Math.max(acc.maxY, cy + height / 2),
        };
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );

    return {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      leftPct: (((bounds.minX + bounds.maxX) / 2) / canvasPx.w) * 100,
      topPct: (((bounds.minY + bounds.maxY) / 2) / canvasPx.h) * 100,
    };
  }

  function toggleMergePick(id: string) {
    setMergeIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // La principal por defecto es la primera elegida; si se deselecciona, pasa a la siguiente.
      setPrimaryId((p) => (p && next.includes(p) ? p : (next[0] ?? null)));
      return next;
    });
  }

  /**
   * Dónde queda cada miembro al acoplarse: en fila pegada al lado derecho de la principal, o al
   * izquierdo si no cabe. Se calcula acá porque es el único sitio que conoce el tamaño en px del
   * lienzo y de cada mesa; el backend solo guarda el resultado.
   */
  function snapPositions(primary: FloorPlanTable, members: FloorPlanTable[]) {
    if (canvasPx.w === 0 || primary.planX == null || primary.planY == null) return [];
    const gap = 2;
    const primaryHalf = dims(primary).width / 2;
    const cx = (primary.planX / 100) * canvasPx.w;
    const cy = (primary.planY / 100) * canvasPx.h;

    const totalRight = members.reduce((acc, m) => acc + dims(m).width + gap, 0);
    // Si la fila se sale por la derecha, se acopla hacia la izquierda.
    const toRight = cx + primaryHalf + totalRight <= canvasPx.w * 0.93;
    const dir = toRight ? 1 : -1;

    let cursor = cx + dir * primaryHalf;
    return members.map((m) => {
      const half = dims(m).width / 2;
      cursor += dir * (gap + half);
      const x = (cursor / canvasPx.w) * 100;
      cursor += dir * half;
      return {
        id: m.id,
        planX: Math.round(Math.min(97, Math.max(3, x)) * 10) / 10,
        planY: Math.round((cy / canvasPx.h) * 100 * 10) / 10,
      };
    });
  }

  function confirmMerge() {
    if (!onMerge || !primaryId || mergeIds.length < 2) return;
    const primary = byId.get(primaryId);
    if (!primary) return;
    const members = mergeIds.filter((id) => id !== primaryId).map((id) => byId.get(id)!).filter(Boolean);
    onMerge(primaryId, members.map((m) => m.id), snapPositions(primary, members));
    setMergeIds([]);
    setPrimaryId(null);
  }

  return (
    <div className="space-y-3">
      <div
        ref={canvasRef}
        className={`relative h-[420px] w-full overflow-hidden rounded-2xl border ${
          editing ? 'border-brand-500/40 bg-[repeating-linear-gradient(0deg,rgba(11,21,36,0.04)_0_1px,transparent_1px_28px),repeating-linear-gradient(90deg,rgba(11,21,36,0.04)_0_1px,transparent_1px_28px)]' : 'border-brand-950/10 bg-brand-950/[0.02]'
        }`}
      >
        {placed.length > 0 && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full border border-brand-950/10 bg-white/90 p-0.5 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - 0.15) * 100) / 100))}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Alejar"
              className="flex h-6 w-6 items-center justify-center rounded-full text-brand-950/60 hover:bg-brand-950/[0.06] disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-1 text-[11px] font-semibold tabular-nums text-brand-950/60 hover:text-brand-500"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + 0.15) * 100) / 100))}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Acercar"
              className="flex h-6 w-6 items-center justify-center rounded-full text-brand-950/60 hover:bg-brand-950/[0.06] disabled:opacity-30"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {placed.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-light text-brand-950/40">
            {editing
              ? 'Arrastra las mesas de abajo hasta donde están en el local.'
              : 'Esta zona todavía no tiene plano. Toca "Editar plano" para ubicar sus mesas.'}
          </p>
        )}

        {placed.map((t) => {
          // Las mesas pegadas a otra no se dibujan solas: viven dentro de la cápsula de su grupo.
          if (memberIds.has(t.id)) return null;

          const tone = tableTone(t);
          const isGroup = t.mergedTableIds.length > 0;
          const box = isGroup ? groupBox(t) : null;
          const own = dims(t);
          // Un grupo se dibuja como UNA sola mesa: la caja que envuelve a todas sus partes.
          const width = box ? box.width : own.width;
          const height = box ? box.height : own.height;
          const leftPct = box ? box.leftPct : (t.planX as number);
          const topPct = box ? box.topPct : (t.planY as number);
          const seatGap = Math.max(6, 9 * zoom);
          const seatDot = Math.max(5, 7 * zoom);
          // Alrededor del grupo van las sillas de todas sus mesas, no solo las de la principal.
          const seats = seatOffsets(isGroup ? 'RECTANGLE' : t.planShape, isGroup ? t.groupSeats : t.seats, width, height, seatGap);
          const picked = mergeIds.includes(t.id);
          const label = isGroup ? t.mergedNumbers.join('+') : t.number;
          return (
            <div key={t.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${leftPct}%`, top: `${topPct}%` }}>
              {seats.map((s, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute rounded-full bg-brand-950/15"
                  style={{
                    width: seatDot,
                    height: seatDot,
                    left: width / 2 + s.x - seatDot / 2,
                    top: height / 2 + s.y - seatDot / 2,
                  }}
                />
              ))}
              <button
                type="button"
                onPointerDown={(e) => startDrag(e, t)}
                onMouseDown={(e) => startDrag(e, t)}
                onClick={() => {
                  if (merging) return toggleMergePick(t.id);
                  if (editing) return setSelectedId(t.id);
                  onOpenTable(t);
                }}
                style={{
                  width,
                  height,
                  background: tone.bg,
                  color: tone.fg,
                  touchAction: editing ? 'none' : undefined,
                }}
                className={`flex-col items-center justify-center text-center font-semibold shadow-sm transition-transform ${
                  isGroup || t.planShape === 'SQUARE' || t.planShape === 'RECTANGLE' ? 'rounded-xl' : 'rounded-full'
                } flex ${editing ? 'cursor-grab active:cursor-grabbing' : 'hover:scale-105'} ${
                  selectedId === t.id && editing ? 'ring-2 ring-brand-500 ring-offset-2' : ''
                } ${picked ? 'ring-2 ring-brand-500 ring-offset-2' : ''} ${
                  merging && !picked ? 'opacity-60' : ''
                }`}
              >
                <span className="text-[13px] leading-none">{label}</span>
                <span className="mt-0.5 text-[9px] font-medium opacity-75">{tone.label}</span>
              </button>
              {merging && picked && (
                <span
                  className={`pointer-events-none absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ring-2 ring-white ${
                    primaryId === t.id ? 'bg-brand-500' : 'bg-brand-950/50'
                  }`}
                >
                  {primaryId === t.id ? '$' : mergeIds.indexOf(t.id) + 1}
                </span>
              )}
              {!editing && !merging && isGroup && onUnmerge && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnmerge(t.id);
                  }}
                  aria-label={`Separar las mesas ${label}`}
                  title="Separar mesas"
                  className="absolute -bottom-2 left-1/2 flex h-6 -translate-x-1/2 items-center gap-1 rounded-full border border-brand-950/10 bg-white px-2 text-[10px] font-semibold text-brand-950/60 shadow-sm hover:text-brand-950"
                >
                  <Link2Off className="h-3 w-3" /> Separar
                </button>
              )}
              {!editing && t.serviceRequest && onAcknowledge && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAcknowledge(t);
                  }}
                  aria-label={t.serviceRequest === 'WAITER_CALL' ? 'Atender llamado al mesonero' : 'Marcar cuenta entregada'}
                  title={t.serviceRequest === 'WAITER_CALL' ? 'Llamando al mesonero' : 'Pidió la cuenta'}
                  className={`absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full shadow ring-2 ring-white animate-pulse ${
                    t.serviceRequest === 'WAITER_CALL'
                      ? 'bg-amber-400 text-amber-950 hover:bg-amber-300'
                      : 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
                  }`}
                >
                  {t.serviceRequest === 'WAITER_CALL' ? <BellRing className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {merging && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/[0.04] px-3 py-2">
          {mergeIds.length < 2 ? (
            <span className="text-xs font-medium text-brand-950/60">
              Toca las mesas que quieres unir (mínimo 2). Quedarán como una sola mesa con una sola cuenta.
            </span>
          ) : (
            <>
              <span className="text-xs font-semibold text-brand-950">
                {mergeIds.length} mesas — la cuenta queda en la{' '}
                {primaryId ? (byId.get(primaryId)?.number ?? '') : '—'}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {mergeIds.map((id) => (
                  <ShapeButton key={id} active={primaryId === id} onClick={() => setPrimaryId(id)}>
                    {byId.get(id)?.number ?? ''}
                  </ShapeButton>
                ))}
              </div>
              <TextureButton
                variant="brand"
                size="sm"
                className="!w-auto ml-auto flex items-center gap-1.5"
                onClick={confirmMerge}
              >
                <Link2 className="h-3.5 w-3.5" /> Unir
              </TextureButton>
            </>
          )}
        </div>
      )}

      {editing && selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-950/10 bg-white px-3 py-2">
          <span className="text-xs font-semibold text-brand-950">{selected.number}</span>
          <div className="flex items-center gap-1">
            <ShapeButton
              active={selected.planShape !== 'SQUARE' && selected.planShape !== 'RECTANGLE'}
              onClick={() => patch(selected.id, { planShape: 'ROUND' })}
            >
              <Circle className="h-3.5 w-3.5" /> Redonda
            </ShapeButton>
            <ShapeButton active={selected.planShape === 'SQUARE'} onClick={() => patch(selected.id, { planShape: 'SQUARE' })}>
              <Square className="h-3.5 w-3.5" /> Cuadrada
            </ShapeButton>
            <ShapeButton active={selected.planShape === 'RECTANGLE'} onClick={() => patch(selected.id, { planShape: 'RECTANGLE' })}>
              <RectangleHorizontal className="h-3.5 w-3.5" /> Rectangular (6)
            </ShapeButton>
          </div>
          <div className="flex items-center gap-1">
            {([0.8, 1, 1.35, 1.7] as const).map((s) => (
              <ShapeButton key={s} active={(selected.planSize || 1) === s} onClick={() => patch(selected.id, { planSize: s })}>
                {s === 0.8 ? 'XS' : s === 1 ? 'M' : s === 1.35 ? 'L' : 'XL'}
              </ShapeButton>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-brand-950/[0.06] px-1.5 py-0.5">
            <button
              type="button"
              aria-label="Quitar una silla"
              disabled={selected.seats <= MIN_SEATS}
              onClick={() => patch(selected.id, { seats: Math.max(MIN_SEATS, selected.seats - 1) })}
              className="flex h-5 w-5 items-center justify-center rounded-full text-brand-950/60 hover:bg-brand-950/10 disabled:opacity-30"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[4.5rem] text-center text-[11px] font-semibold tabular-nums text-brand-950/70">
              {selected.seats} {selected.seats === 1 ? 'silla' : 'sillas'}
            </span>
            <button
              type="button"
              aria-label="Agregar una silla"
              disabled={selected.seats >= MAX_SEATS}
              onClick={() => patch(selected.id, { seats: Math.min(MAX_SEATS, selected.seats + 1) })}
              className="flex h-5 w-5 items-center justify-center rounded-full text-brand-950/60 hover:bg-brand-950/10 disabled:opacity-30"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              patch(selected.id, { planX: null, planY: null });
              setSelectedId(null);
            }}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-brand-950/50 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" /> Quitar del plano
          </button>
        </div>
      )}

      {unplaced.length > 0 && (
        <div className="rounded-xl border border-dashed border-brand-950/15 px-3 py-2.5">
          <p className="mb-2 text-xs font-medium text-brand-950/50">
            {editing ? 'Sin ubicar — tócalas para ponerlas en el centro y luego arrástralas' : 'Sin ubicar en el plano'}
          </p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((t) => {
              const tone = tableTone(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  style={{ background: tone.bg, color: tone.fg }}
                  onClick={() => (editing ? patch(t.id, { planX: 50, planY: 50 }) : onOpenTable(t))}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm hover:opacity-90"
                >
                  {t.number}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ShapeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/55 hover:bg-brand-950/10'
      }`}
    >
      {children}
    </button>
  );
}

/** Guarda en el backend los cambios de plano acumulados de todas las zonas. */
export async function saveFloorPlan(patches: FloorPlanPatch[]) {
  if (patches.length === 0) return;
  await api.patch('/tables/floor-plan', { tables: patches });
}

/** Botón de guardado que usa la pantalla de Órdenes de Mesa. */
export function SaveFloorPlanButton({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  return (
    <TextureButton variant="brand" size="sm" className="!w-auto disabled:opacity-50" disabled={!dirty || saving} onClick={onSave}>
      <Save className="mr-1 h-3.5 w-3.5" /> {saving ? 'Guardando…' : 'Guardar plano'}
    </TextureButton>
  );
}

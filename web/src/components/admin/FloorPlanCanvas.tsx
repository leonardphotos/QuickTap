import { useRef, useState } from 'react';
import { Circle, Save, Square, X } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import type { FloorPlanTable } from '@/types';

/**
 * Planimetría del salón: dibuja las mesas de una zona donde de verdad están en el local.
 *
 * Las posiciones se guardan en PORCENTAJE del lienzo (0-100), no en píxeles: el mismo plano
 * se ve igual en el celular del mesero y en el monitor de caja. En modo edición las mesas se
 * arrastran, cambian de forma (redonda/cuadrada) y de tamaño; en modo normal se comportan
 * como los botones de siempre — un toque abre la mesa.
 */

export interface FloorPlanPatch {
  id: string;
  planX: number | null;
  planY: number | null;
  planShape?: 'ROUND' | 'SQUARE';
  planSize?: number;
}

/** Color de la mesa según su estado — mismo criterio que la vista de lista. */
function tableTone(t: FloorPlanTable): { bg: string; fg: string; label: string } {
  if (t.serviceRequest) return { bg: '#fbedd6', fg: '#8a5106', label: 'Cuenta' };
  if (t.sessions.length > 1) return { bg: '#dfe3ea', fg: '#0b1524', label: `${t.sessions.length} cuentas` };
  if (t.sessions.length === 1) return { bg: '#dfe3ea', fg: '#0b1524', label: 'Ocupada' };
  if (t.reserved) return { bg: '#fbe7f1', fg: '#9d2469', label: 'Reservada' };
  return { bg: '#e3f5ec', fg: '#0f6e46', label: 'Libre' };
}

export function FloorPlanCanvas({
  zoneId,
  tables,
  editing,
  onOpenTable,
  onPatches,
}: {
  zoneId: string;
  tables: FloorPlanTable[];
  editing: boolean;
  onOpenTable: (t: FloorPlanTable) => void;
  /** Cambios pendientes de esta zona; la pantalla los junta y los guarda de una sola vez. */
  onPatches: (zoneId: string, patches: FloorPlanPatch[]) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  // Cambios locales todavía sin guardar, por id de mesa.
  const [draft, setDraft] = useState<Record<string, FloorPlanPatch>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const merged = tables.map((t) => {
    const d = draft[t.id];
    return d ? { ...t, planX: d.planX, planY: d.planY, planShape: d.planShape ?? t.planShape, planSize: d.planSize ?? t.planSize } : t;
  });
  const placed = merged.filter((t) => t.planX != null && t.planY != null);
  const unplaced = merged.filter((t) => t.planX == null || t.planY == null);

  function patch(id: string, changes: Partial<FloorPlanPatch>) {
    setDraft((prev) => {
      const current = prev[id] ?? {
        id,
        planX: merged.find((t) => t.id === id)?.planX ?? null,
        planY: merged.find((t) => t.id === id)?.planY ?? null,
      };
      const next = { ...prev, [id]: { ...current, ...changes } };
      onPatches(zoneId, Object.values(next));
      return next;
    });
  }

  /** Convierte la posición del puntero a % del lienzo, recortado al borde. */
  function pointToPercent(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.min(96, Math.max(4, x)), y: Math.min(94, Math.max(6, y)) };
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

  return (
    <div className="space-y-3">
      <div
        ref={canvasRef}
        className={`relative h-[420px] w-full overflow-hidden rounded-2xl border ${
          editing ? 'border-brand-500/40 bg-[repeating-linear-gradient(0deg,rgba(11,21,36,0.04)_0_1px,transparent_1px_28px),repeating-linear-gradient(90deg,rgba(11,21,36,0.04)_0_1px,transparent_1px_28px)]' : 'border-brand-950/10 bg-brand-950/[0.02]'
        }`}
      >
        {placed.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-light text-brand-950/40">
            {editing
              ? 'Arrastra las mesas de abajo hasta donde están en el local.'
              : 'Esta zona todavía no tiene plano. Toca "Editar plano" para ubicar sus mesas.'}
          </p>
        )}

        {placed.map((t) => {
          const tone = tableTone(t);
          const size = 56 * (t.planSize || 1);
          return (
            <button
              key={t.id}
              type="button"
              onPointerDown={(e) => startDrag(e, t)}
              onMouseDown={(e) => startDrag(e, t)}
              onClick={() => (editing ? setSelectedId(t.id) : onOpenTable(t))}
              style={{
                left: `${t.planX}%`,
                top: `${t.planY}%`,
                width: size,
                height: size,
                background: tone.bg,
                color: tone.fg,
                touchAction: editing ? 'none' : undefined,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center font-semibold shadow-sm transition-transform ${
                t.planShape === 'SQUARE' ? 'rounded-xl' : 'rounded-full'
              } flex ${editing ? 'cursor-grab active:cursor-grabbing' : 'hover:scale-105'} ${
                selectedId === t.id && editing ? 'ring-2 ring-brand-500 ring-offset-2' : ''
              }`}
            >
              <span className="text-[13px] leading-none">{t.number}</span>
              <span className="mt-0.5 text-[9px] font-medium opacity-75">{tone.label}</span>
            </button>
          );
        })}
      </div>

      {editing && selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-950/10 bg-white px-3 py-2">
          <span className="text-xs font-semibold text-brand-950">Mesa {selected.number}</span>
          <div className="flex items-center gap-1">
            <ShapeButton active={selected.planShape !== 'SQUARE'} onClick={() => patch(selected.id, { planShape: 'ROUND' })}>
              <Circle className="h-3.5 w-3.5" /> Redonda
            </ShapeButton>
            <ShapeButton active={selected.planShape === 'SQUARE'} onClick={() => patch(selected.id, { planShape: 'SQUARE' })}>
              <Square className="h-3.5 w-3.5" /> Cuadrada
            </ShapeButton>
          </div>
          <div className="flex items-center gap-1">
            {([0.8, 1, 1.35, 1.7] as const).map((s) => (
              <ShapeButton key={s} active={(selected.planSize || 1) === s} onClick={() => patch(selected.id, { planSize: s })}>
                {s === 0.8 ? 'XS' : s === 1 ? 'M' : s === 1.35 ? 'L' : 'XL'}
              </ShapeButton>
            ))}
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

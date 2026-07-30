import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VENEZUELA_STATES } from '@/utils/venezuela-states';
import { parseZoneList, hexagonAround, type ParsedZoneRow } from '@/utils/parse-zone-list';

type Step = 'estado' | 'fuente' | 'revision';
type RowStatus = 'pendiente' | 'buscando' | 'encontrada' | 'no encontrada';

interface Row extends ParsedZoneRow {
  status: RowStatus;
  lat?: number;
  lng?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** Un solo request de geocodificación a la vez, con ~1.1s entre ellos — límite
 * de uso justo de Nominatim (OpenStreetMap), que bloquea ráfagas de requests. */
async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ format: 'jsonv2', q: query, limit: '1' });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
    }
  } catch {
    // Sin conexión al servicio — la fila queda como "no encontrada".
  }
  return null;
}

/**
 * "Ajustes → Delivery → Importar lista": en vez de dibujar zona por zona, el
 * restaurante pega el texto de una lista que ya tenía (papel, nota, WhatsApp) o
 * sube una foto de esa lista, y el sistema detecta nombre+precio de cada línea.
 * El estado se pide primero para acotar la búsqueda de ubicación de cada zona
 * (nombres como "Zona Norte" se repiten en decenas de ciudades).
 *
 * La ubicación es aproximada (geocodificación por nombre, no un polígono real
 * dibujado a mano) — cada zona importada queda como un hexágono de ~600m
 * alrededor del punto encontrado, editable después desde el mapa normal.
 */
export function ImportZonesDialog({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = useState<Step>('estado');
  const [state, setState] = useState('');
  const [source, setSource] = useState<'texto' | 'imagen'>('texto');
  const [text, setText] = useState('');
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep('estado');
    setState('');
    setSource('texto');
    setText('');
    setOcrProgress(null);
    setOcrError(null);
    setRows([]);
    setLocating(false);
    setSaving(false);
    setError(null);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function detectFromText(raw: string) {
    const parsed = parseZoneList(raw);
    if (parsed.length === 0) {
      setError('No se detectó ninguna zona con precio en ese texto. Revisa que cada línea termine en un número.');
      return;
    }
    setError(null);
    setRows(parsed.map((r) => ({ ...r, status: 'pendiente' })));
    setStep('revision');
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);
    setOcrProgress(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('spa', undefined, {
        logger: (m) => {
          if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100));
        },
      });
      const {
        data: { text: recognizedText },
      } = await worker.recognize(file);
      await worker.terminate();
      setOcrProgress(null);
      detectFromText(recognizedText);
    } catch {
      setOcrProgress(null);
      setOcrError('No se pudo leer la imagen. Prueba con una foto más nítida, o pega el texto directamente.');
    } finally {
      e.target.value = '';
    }
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function locateAll() {
    setLocating(true);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].lat != null) continue;
      updateRow(i, { status: 'buscando' });
      const hit = await geocode(`${rows[i].name}, ${state}, Venezuela`);
      if (hit) {
        updateRow(i, { status: 'encontrada', lat: hit.lat, lng: hit.lng });
      } else {
        updateRow(i, { status: 'no encontrada' });
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
    setLocating(false);
  }

  const locatedRows = rows.filter((r) => r.lat != null && r.lng != null);
  const anyPending = rows.some((r) => r.status === 'pendiente');

  async function save() {
    if (locatedRows.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/delivery-zones/bulk', {
        zones: locatedRows.map((r) => ({
          name: r.name,
          price: r.price,
          polygon: hexagonAround(r.lat!, r.lng!),
        })),
      });
      onImported();
      close();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudieron guardar las zonas.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar lista de zonas</DialogTitle>
          <DialogDescription>
            Pega tu lista de zonas y precios, o sube una foto — el sistema detecta cada zona automáticamente.
          </DialogDescription>
        </DialogHeader>

        {step === 'estado' && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-brand-950/70">¿En qué estado está tu local?</span>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
              >
                <option value="">Selecciona un estado…</option>
                {VENEZUELA_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs font-light text-brand-950/50">
              Esto ayuda a ubicar cada zona en el mapa correctamente — nombres como "Zona Norte" se repiten en
              muchas ciudades.
            </p>
            <TextureButton
              variant="brand"
              size="default"
              disabled={!state}
              className="!w-auto disabled:opacity-50"
              onClick={() => setStep('fuente')}
            >
              Continuar
            </TextureButton>
          </div>
        )}

        {step === 'fuente' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSource('texto')}
                className={`flex-1 rounded-xl border p-2.5 text-sm font-medium transition-colors ${
                  source === 'texto' ? 'border-brand-500 bg-brand-500/5 text-brand-700' : 'border-brand-950/10 text-brand-950/60'
                }`}
              >
                Pegar lista
              </button>
              <button
                type="button"
                onClick={() => setSource('imagen')}
                className={`flex-1 rounded-xl border p-2.5 text-sm font-medium transition-colors ${
                  source === 'imagen' ? 'border-brand-500 bg-brand-500/5 text-brand-700' : 'border-brand-950/10 text-brand-950/60'
                }`}
              >
                Subir imagen
              </button>
            </div>

            {source === 'texto' && (
              <div className="space-y-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'Zona Norte: 5\nZona Centro - 3.50\nZona Sur    8'}
                  rows={7}
                  className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                />
                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={!text.trim()}
                  className="!w-auto disabled:opacity-50"
                  onClick={() => detectFromText(text)}
                >
                  Detectar zonas
                </TextureButton>
              </div>
            )}

            {source === 'imagen' && (
              <div className="space-y-2">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-brand-950/20 bg-brand-950/[0.02] px-4 py-8 text-center hover:border-brand-500/40">
                  <ImageIcon className="h-6 w-6 text-brand-950/40" />
                  <span className="text-sm text-brand-950/60">Toca para elegir una foto de la lista</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
                {ocrProgress !== null && (
                  <div className="flex items-center gap-2 text-sm text-brand-950/60">
                    <Loader2 className="h-4 w-4 animate-spin" /> Leyendo imagen… {ocrProgress}%
                  </div>
                )}
                {ocrError && <p className="text-sm text-red-600">{ocrError}</p>}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {step === 'revision' && (
          <div className="space-y-3">
            <p className="text-sm text-brand-950/70">
              {rows.length} zona{rows.length === 1 ? '' : 's'} detectada{rows.length === 1 ? '' : 's'}. Revisa nombre y
              precio, luego busca su ubicación en {state}.
            </p>

            <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-brand-950/10 p-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-brand-950/[0.02] p-2">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(i, { name: e.target.value, lat: undefined, status: 'pendiente' })}
                    className="min-w-0 flex-1 rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={r.price}
                    onChange={(e) => updateRow(i, { price: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                    className="w-20 rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm"
                  />
                  <span
                    className={`w-24 shrink-0 text-center text-xs font-medium ${
                      r.status === 'encontrada'
                        ? 'text-emerald-600'
                        : r.status === 'no encontrada'
                          ? 'text-red-500'
                          : r.status === 'buscando'
                            ? 'text-brand-500'
                            : 'text-brand-950/30'
                    }`}
                  >
                    {r.status === 'buscando' ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : r.status}
                  </span>
                  <button onClick={() => removeRow(i)} className="shrink-0 text-brand-950/30 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {rows.length === 0 && <p className="py-4 text-center text-sm font-light text-brand-950/40">Sin zonas.</p>}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {rows.some((r) => r.status === 'no encontrada') && (
              <p className="text-xs font-light text-amber-700">
                Algunas zonas no se pudieron ubicar automáticamente — revisa que el nombre sea un lugar real (ej. "Urb.
                La Trinidad" en vez de "Zona 3") o dibújalas a mano después.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {anyPending && (
                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={locating || rows.length === 0}
                  className="!w-auto disabled:opacity-50"
                  onClick={locateAll}
                >
                  {locating ? 'Buscando ubicaciones…' : 'Buscar ubicaciones'}
                </TextureButton>
              )}
              {!anyPending && locatedRows.length > 0 && (
                <TextureButton
                  variant="brand"
                  size="default"
                  disabled={saving}
                  className="!w-auto disabled:opacity-50"
                  onClick={save}
                >
                  {saving ? 'Guardando…' : `Guardar ${locatedRows.length} zona${locatedRows.length === 1 ? '' : 's'}`}
                </TextureButton>
              )}
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={close}>
                Cancelar
              </TextureButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

export interface AddStockItem {
  id: string;
  name: string;
  currentQuantity: number;
  unitLabel: string;
}

/** Botón + diálogo "Añadir a inventario": elige un ítem de una lista y suma una cantidad a su
 * stock actual (no lo reemplaza). Genérico para insumos y para productos con control de stock —
 * cada página le pasa su propia lista y su propio `onAdd`. */
export function AddStockDialog({ items, onAdd }: { items: AddStockItem[]; onAdd: (id: string, delta: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  function reset() {
    setQuery('');
    setSelectedId(null);
    setAmount('');
    setError(null);
  }

  async function submit() {
    const delta = Number(amount);
    if (!selected || !delta || delta <= 0) {
      setError('Elige un ítem y una cantidad válida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd(selected.id, delta);
      setOpen(false);
      reset();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar el stock.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TextureButton
        variant="minimal"
        size="sm"
        className="!w-auto flex items-center gap-1.5 whitespace-nowrap"
        onClick={() => setOpen(true)}
      >
        Añadir a inventario
      </TextureButton>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir a inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selected ? (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/35" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar…"
                    className="w-full rounded-lg border border-brand-950/15 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
                  {filtered.length === 0 && <p className="p-4 text-sm text-brand-950/40 font-light">Sin resultados.</p>}
                  {filtered.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setSelectedId(i.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-brand-950/[0.03]"
                    >
                      <span className="text-brand-950 truncate">{i.name}</span>
                      <span className="text-xs text-brand-950/40 shrink-0">
                        {i.currentQuantity} {i.unitLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02] px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-950 truncate">{selected.name}</p>
                    <p className="text-xs text-brand-950/50 font-light">
                      Stock actual: {selected.currentQuantity} {selected.unitLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-xs text-brand-500 hover:underline shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
                <div>
                  <p className="text-xs font-medium text-brand-950/50 mb-1.5">Cantidad a añadir</p>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  />
                  {amount && Number(amount) > 0 && (
                    <p className="text-xs text-brand-950/40 font-light mt-1.5">
                      Nuevo stock: {selected.currentQuantity + Number(amount)} {selected.unitLabel}
                    </p>
                  )}
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
                  {saving ? 'Guardando…' : 'Añadir al stock'}
                </TextureButton>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

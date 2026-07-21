import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { SupplierPicker } from './SupplierPicker';
import type { Supplier } from '@/types';

export type ExpenseCategory =
  | 'UTILITIES'
  | 'SUPPLIES'
  | 'RENT'
  | 'PAYROLL'
  | 'ADMINISTRATIVE'
  | 'MARKETING'
  | 'TRANSPORT'
  | 'MAINTENANCE'
  | 'FURNITURE'
  | 'OTHER';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  UTILITIES: 'Servicios públicos',
  SUPPLIES: 'Compra de producto e insumos',
  RENT: 'Arriendo',
  PAYROLL: 'Nómina',
  ADMINISTRATIVE: 'Gastos administrativos',
  MARKETING: 'Mercadeo y Publicidad',
  TRANSPORT: 'Transporte',
  MAINTENANCE: 'Mantenimiento',
  FURNITURE: 'Muebles',
  OTHER: 'Otros',
};

interface InventoryOption {
  id: string;
  name: string;
  unit: string;
}

/** "Agregar gasto": egreso con categoría, proveedor y reabastecimiento opcional de
 * inventario. Compartido entre el Dashboard ("Añadir egreso") y el módulo de Gastos,
 * para que todo egreso quede siempre vinculado a la misma sección. */
export function ExpenseFormDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [amount, setAmount] = useState('');
  const [amountCurrency, setAmountCurrency] = useState<'BASE' | 'BS'>('BASE');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [isRestock, setIsRestock] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryOption[]>([]);
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [inventoryQuantity, setInventoryQuantity] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isRestock && inventoryItems.length === 0) {
      api.get('/inventory').then((res) => setInventoryItems(res.data.data));
    }
  }, [isRestock, inventoryItems.length]);

  async function submit() {
    const amountBase = Number(amount);
    if (!amountBase || amountBase <= 0) {
      setError('Escribe un monto válido.');
      return;
    }
    if (!description.trim()) {
      setError('Escribe una descripción.');
      return;
    }
    if (isRestock && (!inventoryItemId || !inventoryQuantity)) {
      setError('Elige el insumo y la cantidad recibida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/movements', {
        type: 'EXPENSE',
        amountBase,
        amountCurrency,
        description: description.trim(),
        category: category || undefined,
        supplierId: supplier?.id,
        inventoryItemId: isRestock ? inventoryItemId : undefined,
        inventoryQuantity: isRestock ? Number(inventoryQuantity) : undefined,
        isCredit,
      });
      onCreated();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el gasto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar gasto</DialogTitle>
        </DialogHeader>

        {showSupplierPicker ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-brand-950/70">Escoge el proveedor</p>
            <SupplierPicker
              onSelect={(s) => {
                setSupplier(s);
                setShowSupplierPicker(false);
              }}
            />
            <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setShowSupplierPicker(false)}>
              Cancelar
            </TextureButton>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <p className="text-xs font-medium text-brand-950/50 mb-1.5">Monto</p>
                <input
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-brand-950/50 mb-1.5">Moneda</p>
                <select
                  value={amountCurrency}
                  onChange={(e) => setAmountCurrency(e.target.value as 'BASE' | 'BS')}
                  className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                >
                  <option value="BASE">$</option>
                  <option value="BS">Bs</option>
                </select>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-brand-950/50 mb-1.5">Descripción</p>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Compra de agua embotellada"
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-brand-950/50 mb-1.5">Categoría</p>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
                className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
              >
                <option value="">Sin categoría</option>
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-brand-950/10 px-2.5 py-2">
              <span className="text-sm text-brand-950/70">
                {supplier ? `Proveedor: ${supplier.name}` : 'Sin proveedor'}
              </span>
              <button
                type="button"
                onClick={() => setShowSupplierPicker(true)}
                className="text-xs font-medium text-brand-500 hover:text-brand-600 shrink-0"
              >
                {supplier ? 'Cambiar' : 'Escoge el proveedor'}
              </button>
            </div>

            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={isRestock} onChange={(e) => setIsRestock(e.target.checked)} />
              ¿Es reabastecimiento de inventario?
            </label>
            {isRestock && (
              <div className="grid grid-cols-2 gap-2 pl-5">
                <select
                  value={inventoryItemId}
                  onChange={(e) => setInventoryItemId(e.target.value)}
                  className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                >
                  <option value="">Insumo…</option>
                  {inventoryItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.unit})
                    </option>
                  ))}
                </select>
                <input
                  value={inventoryQuantity}
                  onChange={(e) => setInventoryQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Cantidad recibida"
                  className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                />
              </div>
            )}

            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} />
              ¿A crédito? (queda pendiente por pagar al proveedor)
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar gasto'}
            </TextureButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

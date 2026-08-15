import { PurchasesHub } from '@/components/admin/purchases/PurchasesHub';

/** Módulo de Compras (menú lateral, debajo de Gastos) — ver PurchasesHub. */
export default function PurchasesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Compras</h1>
        <p className="mt-1 text-sm font-light text-brand-950/60">
          Registra lo que le compras a cada proveedor, repón el inventario, lleva el libro de compras y califica a quién
          te vende.
        </p>
      </div>
      <PurchasesHub />
    </div>
  );
}

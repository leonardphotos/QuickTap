import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

interface BranchInventory {
  branchId: string;
  name: string;
  isMain: boolean;
  items: { id: string; low: boolean }[];
}

/** Inventario por sucursal, condensado (Resumen, escritorio/iPad) — solo cuenta insumos bajo
 * mínimo por sede; el detalle completo por insumo vive en Sucursales → Inventario por sucursal. */
export function InventoryByBranchCard() {
  const [branches, setBranches] = useState<BranchInventory[] | null>(null);

  useEffect(() => {
    api.get('/branches/reports/inventory').then((res) => setBranches(res.data.data));
  }, []);

  if (!branches) return null;

  return (
    <div className="rounded-[26px] border border-brand-950/[0.06] bg-white/85 p-6 shadow-[0_16px_36px_-30px_rgba(0,27,67,0.32)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-2">
        <h3 className="text-[16px] font-bold tracking-[-0.02em] text-brand-950">Inventario por sucursal</h3>
        <Link to="/admin/sucursales" className="text-xs font-medium text-brand-500 hover:underline shrink-0">
          Ver detalle
        </Link>
      </div>
      {branches.length === 0 ? (
        <p className="text-brand-950/40 font-light text-base">Sin sucursales todavía.</p>
      ) : (
        <div className="divide-y divide-brand-950/[0.06]">
          {branches.map((b) => {
            const lowCount = b.items.filter((i) => i.low).length;
            return (
              <div key={b.branchId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <p className="font-medium text-brand-950 text-base">
                  {b.name} {b.isMain && <span className="text-brand-950/40 font-normal">· Sede principal</span>}
                </p>
                {lowCount > 0 ? (
                  <span className="text-xs font-semibold text-red-600 bg-red-50 rounded-full px-2.5 py-1 shrink-0">
                    {lowCount} bajo mínimo
                  </span>
                ) : (
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-1 shrink-0">
                    Stock OK
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

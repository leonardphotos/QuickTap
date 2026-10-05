import { useEffect, useState } from 'react';
import { api } from '@/api/client';

export type ShopCustomerChoice = { id: string; name: string; phone: string; idNumber?: string | null; address?: string | null };

/** Solo selecciona: no modifica la ficha ni los permisos del CRM. */
export function ShopCustomerSearch({ onSelect, inputClassName }: { onSelect: (customer: ShopCustomerChoice) => void; inputClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShopCustomerChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setResults([]); setError('');
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get('/customers', { params: { search: query.trim() || undefined } });
        if (active) setResults(response.data.data.customers.slice(0, 8));
      } catch {
        if (active) setError('No se pudieron cargar los clientes. Cierra y vuelve a abrir la búsqueda para reintentar.');
      } finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query]);
  return <div className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
    <input type="search" maxLength={120} aria-label="Buscar cliente por nombre, teléfono o cédula/RIF" aria-expanded={open} placeholder="Buscar cliente · nombre, teléfono o RIF" value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }} className={inputClassName ? `${inputClassName} w-full` : 'w-full rounded-lg border border-brand-950/15 bg-white px-3 py-2 text-sm font-normal leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30'} />
    {open && <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border border-brand-950/15 bg-white p-3 shadow-lg space-y-2">
      <div role="status" className="text-xs text-brand-950/60">{loading ? 'Buscando clientes…' : error || (!results.length ? 'No encontramos clientes. Puedes completar sus datos manualmente.' : 'Selecciona un cliente para completar sus datos.')}</div>
      {!loading && !error && <ul className="max-h-56 overflow-y-auto space-y-1">
        {results.map(customer => <li key={customer.id}><button type="button" className="w-full rounded-lg px-3 py-2 text-left hover:bg-brand-500/10 focus-visible:outline-brand-500" onClick={() => { onSelect(customer); setOpen(false); setQuery(''); }}>
          <span className="block text-sm font-semibold text-brand-950">{customer.name}</span>
          <span className="block text-xs text-brand-950/60">{[customer.phone, customer.idNumber].filter(Boolean).join(' · ')}</span>
        </button></li>)}
      </ul>}
    </div>}
  </div>;
}

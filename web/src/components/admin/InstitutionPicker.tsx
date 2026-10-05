import { useId, useState } from 'react';
import { Landmark, Search, ChevronDown } from 'lucide-react';
import { FINANCIAL_INSTITUTIONS, INSTITUTION_GROUPS, findInstitution, type FinancialInstitution } from '@/data/financial-institutions';

export function InstitutionLogo({ id, className = '' }: { id?: string | null; className?: string }) {
  // Pendientes de un archivo de marca verificable; evitar peticiones 404.
  const pendingLogo = ['ve-agricola', 've-banfanb', 've-bancoex', 've-bandes', 've-imcp'].includes(id ?? '');
  const institution = pendingLogo ? undefined : findInstitution(id);
  const [failedId, setFailedId] = useState<string | null>(null);
  return <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand-950/10 bg-white p-1.5 ${className}`}>
    {institution && failedId !== institution.id ? <img src={`/images/institutions/${institution.id}.png`} alt="" width={28} height={28} loading="lazy" className="h-full w-full object-contain" onError={() => setFailedId(institution.id)} /> : <Landmark aria-hidden="true" className="h-5 w-5 text-brand-950/45" />}
  </span>;
}

/** Selección explícita: no crea cuentas ni cambia métodos al abrir el catálogo. */
export function InstitutionPicker({ value, onChange, venezuelaOnly = false }: {
  value?: string | null; onChange: (institution: FinancialInstitution | null) => void; venezuelaOnly?: boolean;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const id = useId();
  const institution = findInstitution(value);
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const options = FINANCIAL_INSTITUTIONS.filter(item => (!venezuelaOnly || item.group === 'VE' && item.method === 'MOBILE_PAYMENT') && normalize(`${item.name} ${item.region} ${item.id === 've-bdt' ? 'Bicentenario' : ''} ${item.id === 've-r4' ? 'Mi Banco' : ''}`).includes(normalize(search)));
  return <div className="min-w-0 space-y-2">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-brand-950/15 bg-white p-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-brand-500">
      <InstitutionLogo id={value}/><span className="min-w-0 flex-1 truncate">{institution?.name ?? 'Seleccionar banco o plataforma'}</span><ChevronDown className="h-4 w-4 shrink-0"/>
    </button>
    {open && <div id={id} className="rounded-xl border border-brand-950/10 bg-white p-3 shadow-sm" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <label className="mb-2 flex items-center gap-2 rounded-lg bg-brand-950/[0.04] px-3 text-sm font-medium"><Search className="h-4 w-4"/><input autoFocus aria-label="Buscar banco o plataforma" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nombre o país…" className="min-h-11 min-w-0 flex-1 bg-transparent outline-none text-base"/></label>
      <div className="max-h-72 overflow-y-auto">
        {Object.entries(INSTITUTION_GROUPS).map(([group,label]) => {
          const entries = options.filter(item => item.group === group);
          return entries.length ? <div key={group}><p className="px-2 py-2 font-semibold text-brand-950/50 text-xs">{label}</p>{entries.map(item => <button type="button" key={item.id} aria-pressed={item.id === value} onClick={() => { onChange(item); setOpen(false); setSearch(''); }} className={`flex min-h-12 w-full items-center gap-3 rounded-lg p-2 text-left text-sm hover:bg-brand-500/10 ${item.id === value ? 'bg-brand-500/10' : ''}`}><InstitutionLogo id={item.id}/><span className="min-w-0"><span className="block font-medium">{item.name}</span><span className="text-xs text-brand-950/45">{item.region}</span></span></button>)}</div> : null;
        })}
        {!options.length && <p className="p-3 text-brand-950/60 text-base">No hay coincidencias. Puedes usar una entidad personalizada.</p>}
      </div>
      <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="mt-2 min-h-11 w-full rounded-lg border border-dashed border-brand-950/20 px-3 text-sm text-brand-950/60">Otra entidad / sin selección</button>
    </div>}
  </div>;
}

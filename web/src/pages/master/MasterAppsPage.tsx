import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useMasterAuth } from '@/context/MasterAuthContext.shared';
import { MASTER_NAV_LINKS, canAccessMasterLink } from './master-nav';

const colors: Record<string,string> = {
  summary:'#2563eb', administration:'#059669', printing:'#7c3aed', live:'#0891b2',
  restaurants:'#ea580c', proofs:'#db2777', 'qrnfc-requests':'#4f46e5', quotes:'#0d9488',
  'advisor-leads':'#ca8a04', funnel:'#e11d48', 'catalog-ai':'#9333ea', 'billing-notices':'#0284c7',
  whatsapp:'#16a34a', plans:'#b45309', 'promo-codes':'#c026d3', 'payment-methods':'#475569',
  'ai-usage':'#4338ca', assistant:'#be123c', admins:'#0369a1',
};
export default function MasterAppsPage() {
  const { admin } = useMasterAuth();
  const links = MASTER_NAV_LINKS.filter(item => admin && canAccessMasterLink(admin.role,item));
  return <section aria-label="Herramientas de QuickTap" className="mx-auto max-w-5xl pb-12 pt-5 sm:pt-12">
    <nav aria-label="Aplicaciones del máster" className="grid grid-cols-3 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-8 lg:grid-cols-6">
      {links.map((item)=><Link key={item.to} to={item.to} title={item.hint} className="group flex min-w-0 flex-col items-center rounded-2xl p-2 text-center outline-offset-4 transition-transform active:scale-95 motion-reduce:transform-none">
        <span className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border border-white/90 bg-white p-2 shadow-[0_8px_22px_-12px_rgba(15,23,42,.3)] transition-shadow group-hover:shadow-[0_12px_28px_-10px_rgba(37,99,235,.35)] sm:h-20 sm:w-20"><span style={{backgroundColor:colors[item.to.split('/').pop()!]??'#475569'}} className="flex h-full w-full items-center justify-center rounded-[16px] text-white"><item.icon size={29} strokeWidth={1.7}/></span><ArrowUpRight size={12} className="absolute -right-1 -top-1 rounded-full bg-white text-brand-500 opacity-0 group-hover:opacity-100"/></span>
        <span className="mt-3 text-xs font-medium leading-4 text-slate-700">{item.label}</span>
      </Link>)}
    </nav>
  </section>;
}

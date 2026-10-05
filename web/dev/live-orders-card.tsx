import {createRoot} from 'react-dom/client';
import {LiveOrdersCounter} from '../src/components/master/LiveOrdersCounter';
import {masterApi} from '../src/api/client';
import '../src/index.css';
import '../src/pages/master/master-theme.css';
if(!import.meta.env.DEV)throw new Error('Solo desarrollo');
document.body.classList.add('master-theme');
masterApi.defaults.adapter=async config=>({data:{data:{ordersAllTime:3868,ordersAllTimeUsd:'46007.40',ordersAllTimeBs:'39868227.14'}},config,status:200,statusText:'OK',headers:{}});
createRoot(document.getElementById('root')!).render(<main className="master-ui min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-lg"><LiveOrdersCounter initialRestaurantCounts={{active:25,inactive:3,expiring:4}} initial={3868} initialUsd="46007.40" initialBs="39868227.14"/><p className="mt-3 text-center text-xs text-slate-400">Vista previa · Datos de ejemplo</p></div></main>);

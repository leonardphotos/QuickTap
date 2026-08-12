import { lazy, Suspense, useState } from 'react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { AcademyDetail, type DetailTarget } from './AcademyDetails';

const AcademyTodayTab = lazy(() => import('./AcademyTodayTab'));
const AcademyGroupsTab = lazy(() => import('./AcademyGroupsTab'));
const AcademyStudentsTab = lazy(() => import('./AcademyStudentsTab'));
const AcademyCoachesTab = lazy(() => import('./AcademyCoachesTab'));
const AcademyMoneyTab = lazy(() => import('./AcademyMoneyTab'));
const AcademyProgramsTab = lazy(() => import('./AcademyProgramsTab'));

type Tab = 'hoy' | 'grupos' | 'programas' | 'alumnos' | 'profesores' | 'cobros';

const TAB_LABELS: Record<Tab, string> = {
  hoy: 'Hoy',
  grupos: 'Grupos',
  programas: 'Programas',
  alumnos: 'Alumnos',
  profesores: 'Profesores',
  cobros: 'Cobros',
};

const ADMIN_ONLY: Tab[] = ['profesores', 'cobros'];

/**
 * Academia de pádel. Las clases NO tienen calendario propio: ocupan la misma
 * parrilla que el alquiler libre (ClubCourtBlock con kind = CLASS), así que lo
 * que se agenda acá desaparece de las canchas disponibles solo.
 */
export default function ClubAcademyPage({
  restaurant,
  isAdmin,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>('hoy');
  /**
   * Qué ficha está abierta. Vive acá y no dentro de cada pestaña para poder
   * ENCADENAR: de un grupo a un alumno, de ese alumno a otro de sus grupos, sin
   * cerrar la ventana ni perder dónde estabas.
   */
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';
  const tabs = (Object.keys(TAB_LABELS) as Tab[]).filter((t) => isAdmin || !ADMIN_ONLY.includes(t));
  const active = tabs.includes(tab) ? tab : 'hoy';

  return (
    <div className="flex flex-col gap-5">
      {/* El scroll va en un contenedor APARTE de la píldora: con overflow-x-auto
          sobre la píldora misma nunca se activa —al ser de ancho automático
          siempre "cabe"— y en su lugar estira la página. */}
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                active === t ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<p className="text-sm font-light text-brand-950/40">Cargando…</p>}>
        {active === 'hoy' && <AcademyTodayTab restaurant={restaurant} onOpen={setDetail} />}
        {active === 'grupos' && <AcademyGroupsTab restaurant={restaurant} isAdmin={isAdmin} onOpen={setDetail} />}
        {active === 'programas' && <AcademyProgramsTab onOpen={setDetail} />}
        {active === 'alumnos' && <AcademyStudentsTab restaurant={restaurant} onOpen={setDetail} />}
        {active === 'profesores' && <AcademyCoachesTab restaurant={restaurant} onOpen={setDetail} />}
        {active === 'cobros' && <AcademyMoneyTab restaurant={restaurant} onOpen={setDetail} />}
      </Suspense>

      {detail && (
        <AcademyDetail target={detail} symbol={symbol} onClose={() => setDetail(null)} onNavigate={setDetail} />
      )}
    </div>
  );
}

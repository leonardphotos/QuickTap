import { useEffect, useState } from 'react';
import {
  BookOpen, Building2, ChevronDown, CreditCard, FileBarChart, LayoutDashboard, ListTree, LogOut, Plus, Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { officeApi, type Empresa } from './officeApi';
import OfficeBillingPage from './OfficeBillingPage';
import OfficePanelPage from './OfficePanelPage';
import OfficeAsientosPage from './OfficeAsientosPage';
import OfficeCuentasPage from './OfficeCuentasPage';
import OfficeContactosPage from './OfficeContactosPage';
import OfficeReportesPage from './OfficeReportesPage';
import OfficeEmpresasPage from './OfficeEmpresasPage';

export type OfficeScreen = 'panel' | 'asientos' | 'cuentas' | 'contactos' | 'reportes' | 'empresas' | 'facturacion';

const NAV: { id: OfficeScreen; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'panel', label: 'Panel', icon: LayoutDashboard },
  { id: 'asientos', label: 'Asientos', icon: BookOpen },
  { id: 'cuentas', label: 'Plan de cuentas', icon: ListTree },
  { id: 'contactos', label: 'Clientes y proveedores', icon: Users },
  { id: 'reportes', label: 'Reportes', icon: FileBarChart },
  { id: 'empresas', label: 'Empresas', icon: Building2 },
  { id: 'facturacion', label: 'Facturación', icon: CreditCard },
];

/**
 * Panel del vertical Administrativo.
 *
 * Dos cosas lo separan del resto de QuickTap y explican por qué tiene su propio layout:
 *
 * La primera es que acá el inquilino NO es el negocio, sino quien lo administra. Por eso lo
 * primero de la barra es el selector de empresa: todo lo que se ve debajo —asientos, cuentas,
 * reportes— es de la empresa elegida, y cambiarla cambia el panel entero. La empresa activa se
 * recuerda entre sesiones; volver a elegirla en cada visita sería insufrible para un contador
 * que entra veinte veces al día.
 *
 * La segunda es que no usa ventanas flotantes. Cargar un asiento no es una confirmación de dos
 * campos: es una tarea larga donde hay que ir mirando el plan de cuentas y los montos, y un
 * modal que tapa la pantalla estorba. Cada formulario vive dentro de su pantalla.
 */
export default function OfficeLayout() {
  const { user, restaurant, logout } = useAuth();
  const [screen, setScreen] = useState<OfficeScreen>('panel');
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [empresaId, setEmpresaId] = useState<string>(() => localStorage.getItem('office_empresa') ?? '');
  const [abrirSelector, setAbrirSelector] = useState(false);

  function cargarEmpresas() {
    officeApi.empresas().then((lista) => {
      setEmpresas(lista);
      setEmpresaId((actual) => {
        const sigueExistiendo = lista.some((e) => e.id === actual);
        return sigueExistiendo ? actual : (lista.find((e) => e.activa)?.id ?? '');
      });
    });
  }

  useEffect(cargarEmpresas, []);
  useEffect(() => {
    if (empresaId) localStorage.setItem('office_empresa', empresaId);
  }, [empresaId]);

  const empresa = empresas?.find((e) => e.id === empresaId) ?? null;

  return (
    <div className="min-h-screen bg-[#F5F5F3] text-brand-950">
      <div className="mx-auto flex max-w-[1400px] gap-0 p-3 sm:p-5">
        {/* ---------- Barra lateral ---------- */}
        <aside className="hidden w-60 shrink-0 flex-col rounded-l-2xl border border-brand-950/[0.07] border-r-0 bg-white p-4 lg:flex">
          <div className="flex items-center gap-2 px-2 pb-5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-[13px] font-bold text-white">Q</span>
            <span className="text-[15px] font-semibold tracking-tight">Administración</span>
          </div>

          {/* Selector de empresa: lo primero, porque define todo lo demás. */}
          <div className="relative pb-4">
            <button
              type="button"
              onClick={() => setAbrirSelector((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-brand-950/10 bg-[#FAFAF9] px-3 py-2.5 text-left hover:border-brand-500/30"
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand-950/35">Empresa</span>
                <span className="block truncate text-[13.5px] font-medium">{empresa?.nombre ?? 'Sin empresas'}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-brand-950/30 transition-transform ${abrirSelector ? 'rotate-180' : ''}`} />
            </button>
            {abrirSelector && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-brand-950/10 bg-white shadow-lg">
                {(empresas ?? []).filter((e) => e.activa).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { setEmpresaId(e.id); setAbrirSelector(false); }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-brand-950/[0.03] ${
                      e.id === empresaId ? 'bg-brand-500/[0.08] font-medium' : ''
                    }`}
                  >
                    <span className="min-w-0 truncate">{e.nombre}</span>
                    <span className="shrink-0 text-[10.5px] text-brand-950/35">{e.moneda}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setScreen('empresas'); setAbrirSelector(false); }}
                  className="flex w-full items-center gap-1.5 border-t border-brand-950/[0.06] px-3 py-2 text-left text-[13px] text-brand-500 hover:bg-brand-950/[0.03]"
                >
                  <Plus className="h-3.5 w-3.5" /> Nueva empresa
                </button>
              </div>
            )}
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setScreen(n.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                  screen === n.id ? 'bg-brand-950 font-medium text-white' : 'text-brand-950/65 hover:bg-brand-950/[0.04]'
                }`}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                {n.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-brand-950/[0.07] pt-3">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/12 text-[12px] font-semibold text-brand-500">
                {(user?.name ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{user?.name}</span>
                <span className="block text-[11px] text-brand-950/40">{user?.role}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-brand-950/55 hover:bg-brand-950/[0.04]"
            >
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </aside>

        {/* ---------- Contenido ---------- */}
        <main className="min-w-0 flex-1 rounded-2xl border border-brand-950/[0.07] bg-white lg:rounded-l-none">
          {/* Navegación de celular: la barra lateral no cabe. */}
          <div className="flex gap-1 overflow-x-auto border-b border-brand-950/[0.06] px-3 py-2 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setScreen(n.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] ${
                  screen === n.id ? 'bg-brand-950 text-white' : 'text-brand-950/60'
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>

          {empresas === null ? (
            <p className="p-8 text-sm text-brand-950/40">Cargando…</p>
          ) : screen === 'facturacion' ? (
            // Va antes que el resto: se paga la CUENTA, no una empresa, así que debe poder
            // abrirse aunque todavía no haya ninguna creada.
            <div className="p-5 sm:p-7">
              <OfficeBillingPage restaurant={restaurant!} onDone={() => setScreen('panel')} />
            </div>
          ) : empresas.length === 0 || screen === 'empresas' ? (
            <OfficeEmpresasPage
              empresas={empresas}
              onCreada={(id) => { cargarEmpresas(); setEmpresaId(id); setScreen('panel'); }}
            />
          ) : !empresa ? (
            <p className="p-8 text-sm text-brand-950/40">Elige una empresa en la barra lateral.</p>
          ) : (
            <>
              {screen === 'panel' && <OfficePanelPage empresa={empresa} onIrA={setScreen} />}
              {screen === 'asientos' && <OfficeAsientosPage empresa={empresa} />}
              {screen === 'cuentas' && <OfficeCuentasPage empresa={empresa} />}
              {screen === 'contactos' && <OfficeContactosPage empresa={empresa} />}
              {screen === 'reportes' && <OfficeReportesPage empresa={empresa} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useMasterAuth } from '../../context/MasterAuthContext';
import { MoneyVisibilityProvider } from '@/context/MoneyVisibilityContext';
import { MoneyVisibilityToggle } from '@/components/master/MoneyVisibilityToggle';
import { DailyRatesBadge } from '@/components/DailyRatesBadge';
import { TextureButton } from '@/components/ui/texture-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MASTER_CONFIG_LINKS, MASTER_NAV_LINKS, MASTER_OPERATION_LINKS } from './master-nav';

export default function MasterLayout() {
  const { admin, loading, logout } = useMasterAuth();
  const { pathname } = useLocation();

  if (loading) return <div className="p-10 text-center text-brand-950/50 font-light">Cargando…</div>;
  if (!admin) return <Navigate to="/master/login" replace />;

  const configActive = MASTER_CONFIG_LINKS.some((l) => l.to === pathname);

  return (
    <MoneyVisibilityProvider>
      <div className="min-h-screen bg-[#fafafa]">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-brand-950/[0.06]">
          <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center gap-4">
            <Link to="/master/summary" className="flex items-center gap-2 min-w-0 shrink-0">
              <ShieldCheck className="h-5 w-5 text-brand-500 shrink-0" />
              <p className="font-medium text-brand-950 truncate text-[15px] hidden lg:block">Dashboard de administrador</p>
            </Link>

            {/* Solo los 4 destinos de uso diario; el resto vive en "Configuración" para que las
                pastillas no se compriman ni partan el texto en varias líneas. */}
            <nav className="hidden sm:flex items-center gap-1 flex-1 min-w-0">
              {MASTER_OPERATION_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    pathname === l.to ? 'bg-brand-950 text-white' : 'text-brand-950/60 hover:bg-brand-950/[0.06]'
                  }`}
                >
                  <l.icon className="h-3.5 w-3.5 shrink-0" /> {l.label}
                </Link>
              ))}

              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors outline-none ${
                    configActive ? 'bg-brand-950 text-white' : 'text-brand-950/60 hover:bg-brand-950/[0.06]'
                  }`}
                >
                  <Settings className="h-3.5 w-3.5 shrink-0" /> Configuración
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {MASTER_CONFIG_LINKS.map((l) => (
                    <DropdownMenuItem key={l.to} asChild>
                      <Link to={l.to} className="flex items-start gap-2.5 cursor-pointer">
                        <l.icon className="h-4 w-4 mt-0.5 shrink-0 text-brand-950/50" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-brand-950">{l.label}</span>
                          <span className="block text-[11px] text-brand-950/45 font-light">{l.hint}</span>
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
              {/* Con las 5 pastillas de operación + Configuración, en anchos medios la tasa
                  se montaba sobre el menú — solo se muestra donde realmente cabe. */}
              <DailyRatesBadge className="hidden xl:inline" />
              <MoneyVisibilityToggle className="text-brand-950/50 hover:text-brand-500 transition-colors" />
              <TextureButton variant="icon" size="icon" aria-label="Salir" onClick={logout}>
                <LogOut className="h-4 w-4 text-brand-950/70" />
              </TextureButton>
            </div>
          </div>

          {/* En celular no hay espacio para el desplegable: se listan todos en una fila deslizable. */}
          <nav className="sm:hidden flex items-center gap-1 overflow-x-auto px-4 pb-3 -mt-1">
            {MASTER_NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === l.to ? 'bg-brand-950 text-white' : 'text-brand-950/60 bg-brand-950/[0.06]'
                }`}
              >
                <l.icon className="h-3.5 w-3.5 shrink-0" /> {l.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-10">
          <Outlet />
        </main>
      </div>
    </MoneyVisibilityProvider>
  );
}

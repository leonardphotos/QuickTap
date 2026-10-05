import { useState } from 'react';
import { Building2, Crown, Palette, Printer, ShieldCheck, Wallet } from 'lucide-react';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { ProposalSidebar } from '../dashboard/ProposalSidebar';
import { CategoryNav, type SettingsCategoryDef } from './CategoryNav';
import { AparienciaSection, EquipoSection, ImpresionSection, NegocioSection, PagosSection, PlanSection } from './sections';

const CATEGORIES: SettingsCategoryDef[] = [
  { id: 'negocio', title: 'Negocio', description: 'Datos del local, horario y acceso directo.', icon: <Building2 className="h-4 w-4" /> },
  { id: 'plan', title: 'Mi plan', description: 'Plan actual y cambios de suscripción.', icon: <Crown className="h-4 w-4" /> },
  { id: 'pagos', title: 'Pagos y moneda', description: 'Tasa cambiaria y métodos de pago.', icon: <Wallet className="h-4 w-4" /> },
  { id: 'equipo', title: 'Equipo y seguridad', description: 'Usuarios, PIN de borrado y bloqueo.', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'apariencia', title: 'Apariencia', description: 'Color de marca e imagen del menú.', icon: <Palette className="h-4 w-4" /> },
  { id: 'impresion', title: 'Estación de impresión', description: 'Impresora de comandas y modo offline.', icon: <Printer className="h-4 w-4" /> },
];

/**
 * Propuesta de rediseño de Ajustes (/admin/settings), con datos de ejemplo. Mantiene la idea
 * central de la pantalla real (categorías + panel de contenido) pero homogeneiza las tarjetas
 * con el lenguaje visual del resto del panel: fondo gris claro, tarjetas blancas de borde
 * sutil, acentos de marca en vez de la mezcla de estilos de las secciones actuales.
 */
export default function SettingsProposalPage() {
  useDocumentMeta('Propuesta · Ajustes | QuickTap');
  const [active, setActive] = useState('negocio');
  const current = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <ProposalSidebar active="Ajustes" />
      <div className="lg:pl-[248px]">
        <main className="mx-auto max-w-[1400px] px-5 py-8 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-brand-950 md:text-[28px]">Ajustes</h1>
            <p className="mt-1 text-sm font-light text-brand-950/50">Configura tu negocio, pagos, equipo y más.</p>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <CategoryNav categories={CATEGORIES} active={active} onChange={setActive} />

            <div className="min-w-0 flex-1">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                  {current.icon}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-brand-950">{current.title}</h2>
                  <p className="text-sm font-light text-brand-950/45">{current.description}</p>
                </div>
              </div>

              {active === 'negocio' && <NegocioSection />}
              {active === 'plan' && <PlanSection />}
              {active === 'pagos' && <PagosSection />}
              {active === 'equipo' && <EquipoSection />}
              {active === 'apariencia' && <AparienciaSection />}
              {active === 'impresion' && <ImpresionSection />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

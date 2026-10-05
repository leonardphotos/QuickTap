import { createContext, useContext, type ReactNode } from 'react';
import { Building2, SlidersHorizontal, ShieldCheck, ChevronRight } from 'lucide-react';
import './settings-workspace.css';

export type SettingsOption = { id: string; title: string; description: string; icon: ReactNode; group: 'negocio' | 'operacion' | 'administracion' };
const ActiveSettings = createContext('negocio');
const groups = [
  { id: 'negocio', title: 'Tu negocio', icon: Building2 },
  { id: 'operacion', title: 'Operación', icon: SlidersHorizontal },
  { id: 'administracion', title: 'Administración', icon: ShieldCheck },
] as const;

export function SettingsWorkspace({ options, active, onSelect, children }: { options: SettingsOption[]; active: string; onSelect: (id: string) => void; children: ReactNode }) {
  const selected = options.find(o => o.id === active) ?? options[0];
  return <ActiveSettings.Provider value={selected.id}>
    <div className="settings-workspace">
      <header className="settings-heading">
        <p className="settings-eyebrow">CONFIGURACIÓN DEL RESTAURANTE</p>
        <h1>Ajustes</h1>
        <p>Personaliza tu negocio y organiza cómo trabaja tu equipo.</p>
      </header>
      <nav className="settings-groups" aria-label="Categorías de ajustes">
        {groups.filter(g => options.some(o => o.group === g.id)).map(g => <button key={g.id} type="button" aria-current={selected.group === g.id ? 'page' : undefined} onClick={() => { if (selected.group !== g.id) onSelect(options.find(o => o.group === g.id)!.id); }}>
          <g.icon size={17} aria-hidden="true" />{g.title}
        </button>)}
      </nav>
      <div className="settings-surface">
        <nav className="settings-options" aria-label="Opciones de ajustes">
          <p className="settings-eyebrow">{groups.find(g => g.id === selected.group)?.title}</p>
          {options.filter(o => o.group === selected.group).map(o => <button type="button" key={o.id} aria-current={selected.id === o.id ? 'page' : undefined} aria-controls={`ajustes-${o.id}`} onClick={() => onSelect(o.id)}>
            <span className="settings-option-icon">{o.icon}</span><span>{o.title}</span><ChevronRight size={14} aria-hidden="true" />
          </button>)}
        </nav>
        <div className="settings-detail">
          <header className="settings-detail-heading">
            <span className="settings-detail-icon" aria-hidden="true">{selected.icon}</span>
            <div><h2 id="settings-section-title">{selected.title}</h2><p>{selected.description}</p></div>
          </header>
          {children}
        </div>
      </div>
    </div>
  </ActiveSettings.Provider>;
}

/** Mantiene los formularios montados al navegar para conservar cambios sin guardar. */
export function SettingsCategory({ id, children }: { id: string; children: ReactNode; title?: string; icon?: ReactNode; open?: boolean; onToggle?: (id: string) => void }) {
  const active = useContext(ActiveSettings);
  return <section id={`ajustes-${id}`} hidden={active !== id} data-settings-panel aria-labelledby="settings-section-title">{children}</section>;
}

export function FullWidth({ children }: { children: ReactNode }) { return <div className="min-w-0">{children}</div>; }

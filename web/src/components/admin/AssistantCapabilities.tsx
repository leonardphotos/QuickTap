import { ArrowUpRight, BookOpen, CalendarClock, ChefHat, FileSpreadsheet, Layers3, Tags, ChartNoAxesCombined, Sprout } from 'lucide-react';

const examples = [
  { title: 'Actualizar tu menú en lote', icon: Tags, description: 'Cambiar nombres, descripciones y precios simples de varios platos en una solicitud.', prompt: 'Quiero actualizar varios platos de mi menú. Ayúdame a preparar los cambios de nombres, descripciones y precios; te indicaré los productos y sus nuevos valores.' },
  { title: 'Armar combos con extras', icon: Layers3, description: 'Crear una promoción con ingredientes y extras distintos para cada pizza o pieza.', prompt: 'Quiero crear un combo con varias piezas y modificadores independientes para cada una. Ayúdame a definir su nombre, categoría, precio, piezas, opciones y límites de selección.', note: 'Los extras todavía no se vinculan a materias primas ni recetas.' },
  { title: 'Preparar el inventario desde Excel', icon: FileSpreadsheet, description: 'Cargar existencias iniciales, sumar una compra o registrar un conteo usando la plantilla.', note: 'Hasta 200 insumos por archivo. Requiere acceso a inventario en tu plan.', upload: true },
  { title: 'Cambiar los horarios de la semana', icon: CalendarClock, description: 'Organizar aperturas, cierres y días sin atención de una sola vez.', prompt: 'Quiero actualizar los horarios de atención de mi restaurante. Te indicaré los días, las horas de apertura y cierre y cuáles estarán cerrados.' },
];

export default function AssistantCapabilities({ onSelect, onUpload, busy }: { onSelect: (prompt: string) => void; onUpload: () => void; busy: boolean }) {
  return <details className="qa-capabilities">
    <summary><BookOpen size={17} /><span>¿Qué puede hacer por ti?</span></summary>
    <div className="qa-capabilities-body">
      <h2>Dedica tu tiempo al restaurante.<br />Delega las tareas repetitivas.</h2>
      <p>Elige un ejemplo para empezar. Revisarás los cambios y su costo antes de aplicarlos.</p>
      <div className="qa-capability-grid">{examples.map(({ title, icon: Icon, description, prompt, note, upload }) => <article key={title}>
        <Icon size={21} strokeWidth={1.6} /><h3>{title}</h3><p>{description}</p>{note && <small>{note}</small>}
        <button type="button" disabled={busy} onClick={e => { if (upload) onUpload(); else if (prompt) onSelect(prompt); const panel = e.currentTarget.closest('details'); if (panel) panel.open = false; }}>{upload ? 'Preparar archivo' : 'Usar este ejemplo'}<ArrowUpRight size={16} /></button>
      </article>)}</div>
      <div className="qa-capability-future"><span>IDEAS PARA AMPLIAR EL ASISTENTE</span><h3>Las siguientes tareas aún no están disponibles</h3>
        <ul><li><Sprout size={18} />Vincular modificadores a materias primas y recetas.</li><li><ChefHat size={18} />Asignar varios platos a una cocina o estación.</li><li><ChartNoAxesCombined size={18} />Consultar reportes financieros de un período concreto.</li></ul>
        <p>Hoy se gestionan desde sus módulos correspondientes. Mostrarlas aquí no significa que el asistente pueda ejecutarlas ni que tengan una fecha de lanzamiento.</p>
      </div>
    </div>
  </details>;
}

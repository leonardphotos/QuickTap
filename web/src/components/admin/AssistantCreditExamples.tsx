import { Sparkles, UtensilsCrossed, Tags, CalendarClock, ArrowUpRight, SlidersHorizontal, Layers3, TextCursorInput } from 'lucide-react';

export type AssistantTariff = { productBatch: number; productBatchSize: number; schedule: number; comboBase: number; comboPart: number; comboGroup: number };

export default function AssistantCreditExamples({ credits, tariff, onIncrease }: { credits: number; tariff: AssistantTariff; onIncrease: () => void }) {
  const combo = (parts: number, groups: number) => tariff.comboBase + parts * tariff.comboPart + groups * tariff.comboGroup;
  const title = credits < 300 ? 'Tus ideas, listas para el menú' : credits < 600 ? 'Renueva tu oferta sin hacerlo todo a mano' : 'Dale forma a los próximos cambios de tu restaurante';
  const examples = [
    { icon: UtensilsCrossed, title: 'Armar una promoción completa', text: 'Crea un trío de pizzas con precio fijo y selección de ingredientes independiente para cada pizza.', example: '«Cada pizza lleva 4 ingredientes a elección».', cost: combo(3, 3) },
    { icon: SlidersHorizontal, title: 'Configurar modificadores y extras', text: 'Crea una promoción con grupos obligatorios u opcionales, límites de selección y precios para los extras de cada pieza.', example: '«Pizza 1 con borde de queso; Pizza 2 sin borde».', cost: combo(3, 6) },
    { icon: Layers3, title: 'Crear distintas opciones dentro de un combo', text: 'Organiza una promoción de 2 piezas con 2 grupos de opciones por pieza, sin mezclar lo que el cliente elige en cada una.', example: '«Cada hamburguesa elige su salsa y sus extras».', cost: combo(2, 4) },
    { icon: TextCursorInput, title: 'Poner en orden nombres y descripciones', text: `Actualiza la información de hasta ${tariff.productBatchSize} productos existentes en una solicitud. Tú indicas los cambios.`, example: '«Cambia estos nombres y usa estas descripciones».', cost: tariff.productBatch },
    { icon: Tags, title: 'Actualizar precios en conjunto', text: `Prepara nuevos precios simples para hasta ${tariff.productBatchSize} productos. Revisa el antes y el después sin abrirlos uno por uno.`, example: '«Actualiza los precios de estos platos con esta lista».', cost: tariff.productBatch },
    { icon: CalendarClock, title: 'Organizar toda la semana de atención', text: 'Cambia las horas de apertura, cierre y los días sin atención en una sola solicitud.', example: '«De lunes a sábado de 12 a 10; domingo cerrado».', cost: tariff.schedule },
  ];
  return <div className="qa-credit-showcase">
    <div className="qa-credit-intro"><span><Sparkles size={15} /> MENOS CONFIGURACIÓN MANUAL</span><h4>{title}</h4><p>No se trata solo de más productos. Delega la preparación de promociones, opciones y cambios que normalmente harías uno por uno.</p></div>
    <div className="qa-credit-grid qa-credit-workflows">{examples.map(({ icon: Icon, title: name, text, example, cost }) => <article key={name}><Icon size={20} /><h5>{name}</h5><p>{text}</p><blockquote>{example}</blockquote><span className="qa-workflow-cost">{cost} créditos en este ejemplo</span></article>)}</div>
    <div className="qa-credit-remainder"><strong>{credits} créditos para combinar estas tareas a tu manera.</strong><span>Las herramientas son las mismas en todas las recargas; más saldo te permite usarlas más veces.</span></div>
    {credits < 1500 && <button type="button" className="qa-credit-upgrade" onClick={onIncrease}><span><strong>Prepara también tus próximas promociones</strong><small>Suma 150 créditos por US$5 más.</small></span><ArrowUpRight size={20} /></button>}
    <p className="qa-credit-criteria text-base">Ejemplos independientes, no un paquete incluido. El precio cambia según la cantidad de piezas, grupos y productos; siempre lo verás antes de confirmar. Los modificadores se crean dentro de promociones nuevas: aún no se añaden a productos existentes ni se vinculan automáticamente a recetas o materia prima. Se respetan los límites de tu plan.</p>
  </div>;
}

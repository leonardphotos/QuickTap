import { Link } from 'react-router-dom';
import { COMMERCIAL_PLANS } from '../../utils/commercial-plans';

export default function FreeMenuComparison() {
  const essential = COMMERCIAL_PLANS.ESSENTIAL;
  return <section className="connect-plan-comparison" aria-labelledby="free-menu-comparison-title">
    <h2 id="free-menu-comparison-title">Menú gratis o Esencial</h2>
    <p>Empieza con tu menú y lleva el control de tu negocio desde el primer día.</p>
    <article>
      <h3>Menú gratis <span>Sin mensualidad</span></h3>
      <ul>
        <li>Hasta 20 productos y 4 categorías, con fotos, descripción y precios en dólares.</li>
        <li>El cliente arma su pedido y lo envía por WhatsApp. Tú confirmas disponibilidad y cobro por ese medio.</li>
        <li>La organización de pedidos y el registro de cobros los llevas por tu cuenta.</li>
      </ul>
    </article>
    <article className="connect-plan-essential">
      <h3>Esencial <span>€{essential.monthly.toFixed(2).replace('.', ',')}/mes</span></h3>
      <p className="connect-plan-value text-base">Comienza con orden. Un panel para gestionar tus pedidos y sus pagos desde tus primeras ventas.</p>
      <ul>
        <li>Centraliza tus pedidos y consulta su estado para dar seguimiento a cada venta.</li>
        <li>Registra los pagos de cada pedido y distingue lo cobrado del saldo pendiente.</li>
        <li>Descarga tu historial de ventas para conservar un respaldo y revisar tus cobros.</li>
        <li>Organiza hasta {essential.products} productos y trabaja con {essential.users} usuarios en {essential.sites} sede.</li>
      </ul>
      <p className="connect-plan-value text-base">Tener registros desde el comienzo te ayuda a detectar pendientes, reducir olvidos y crecer con información organizada.</p>
      <p className="connect-plan-price-note">Precio habitual, antes de promociones. Equipos de impresión e implementación asistida aparte.</p>
      <Link to="/admin/register?plan=ESSENTIAL">Empezar con Esencial →</Link>
    </article>
    <p className="connect-plan-transfer text-base">Puedes comenzar gratis y pasar a un plan conservando tus productos, categorías, fotos y enlace.</p>
  </section>;
}

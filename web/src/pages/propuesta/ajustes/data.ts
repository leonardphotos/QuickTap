// Datos de ejemplo para la propuesta de rediseño de Ajustes. No tocan la API: el objetivo es
// revisar el layout sin sesión ni backend. Al implementarlo, cada tarjeta se conecta a su
// sección real (RestaurantInfoSection, TeamSection, PaymentMethodsSection, etc.).

export const businessHours = [
  { day: 'Lunes a viernes', open: '11:00', close: '22:00', active: true },
  { day: 'Sábado', open: '11:00', close: '23:00', active: true },
  { day: 'Domingo', open: '12:00', close: '20:00', active: true },
];

export const teamMembers = [
  { name: 'Leonard Pérez', role: 'Dueño', initials: 'LP', online: true },
  { name: 'Mariana Gómez', role: 'Administradora', initials: 'MG', online: true },
  { name: 'Carlos Ruiz', role: 'Mesonero', initials: 'CR', online: false },
  { name: 'Ana Torres', role: 'Cocina', initials: 'AT', online: true },
  { name: 'Diego Salas', role: 'Delivery', initials: 'DS', online: false },
];

export const paymentMethodsConfig = [
  { id: 'pm', label: 'Pago móvil', detail: 'Banesco · 0134', enabled: true },
  { id: 'cash', label: 'Efectivo', detail: 'USD y Bs', enabled: true },
  { id: 'pos', label: 'Punto de venta', detail: 'Banco de Venezuela', enabled: true },
  { id: 'zelle', label: 'Zelle', detail: 'pagos@lacasona.com', enabled: false },
];

export const brandColor = '#2f6b4f';

export const planInfo = {
  name: 'Plan Premium',
  priceUsd: 29,
  renewsIn: 12,
  autoRenew: false,
  features: ['Pedidos ilimitados', 'Hasta 6 usuarios', 'WhatsApp vinculado', 'Reportes avanzados'],
};

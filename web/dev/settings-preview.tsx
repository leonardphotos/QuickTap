import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../src/context/AuthContext.shared';
import SettingsPage from '../src/pages/admin/SettingsPage';
import AssistantPage from '../src/pages/admin/AssistantPage';
import { visibleNavLinks } from '../src/pages/admin/nav-links';
import { api } from '../src/api/client';
import '../src/index.css';

// Entrada de desarrollo independiente: nunca consulta ni modifica un restaurante real.
if (!import.meta.env.DEV) throw new Error('Vista previa disponible solo en desarrollo.');
api.defaults.adapter = async (config) => {
  if (config.url === '/assistant') {
    return { data: { data: { balance: 150, enabled: true, tasks: [], topups: [], tariff: { productBatch: 5, productBatchSize: 20, schedule: 2, comboBase: 10, comboPart: 3, comboGroup: 2 } } }, status: 200, statusText: 'OK', headers: {}, config };
  }
  if (config.url === '/assistant/proposals') {
    return { data: { data: { id: 'preview-only', digest: '0'.repeat(64), credits: 19, status: 'QUOTED', expiresAt: new Date(Date.now() + 1800000).toISOString(),
      before: { products: [{ id: 'wok', name: 'Noodle Bar', price: '10' }, { id: 'sushi', name: 'Black Dragón', price: '12' }, { id: 'drink', name: 'Refresco 1 L', price: '3' }],
        kitchens: [{ id: 'hot', name: 'Cocina caliente' }, { id: 'cold', name: 'Sushi' }, { id: 'bar', name: 'Bebidas' }],
        linkedProducts: [{ id: 'wok', kitchenId: 'hot', variants: [{ id: 'small', name: '16 oz' }] }, { id: 'sushi', kitchenId: 'cold', variants: [] }, { id: 'drink', kitchenId: 'bar', variants: [] }] },
      proposal: { message: 'Crearé un combo con dos platos a elección y un refresco. Cada plato conserva sus modificadores, cocina y receta. Revisa la propuesta antes de publicar. Demostración: no se guardarán cambios.', actions: [{ kind: 'COMBO_LINK', name: 'Combo para compartir', price: 20, description: 'Dos platos a tu gusto y un refresco de 1 L.', minSelections: 2, maxSelections: 2, components: [{ productId: 'wok', variantId: 'small', quantity: 1, isChoice: true }, { productId: 'sushi', variantId: null, quantity: 1, isChoice: true }, { productId: 'drink', variantId: null, quantity: 1, isChoice: false }] }] }
    } }, status: 200, statusText: 'OK', headers: {}, config };
  }
  if (config.url === '/assistant/topups/quote') {
    const { credits } = JSON.parse(config.data);
    return { data: { data: { id: 'preview-topup', credits, amountUsd: String(credits / 150 * 5), amountBs: String(credits / 150 * 500), exchangeRate: '100', expiresAt: new Date(Date.now() + 1800000).toISOString(), paymentDetails: { pagoMovil: { banco: 'Ejemplo · no realizar pagos', telefono: 'Datos de demostración', cedula: 'Datos de demostración' } } } }, status: 200, statusText: 'OK', headers: {}, config };
  }
  if (config.method && config.method !== 'get') {
    throw Object.assign(new Error('Esta vista previa no guarda cambios.'), {
      response: { data: { error: 'Esta vista previa no guarda cambios.' } },
    });
  }
  const url = config.url ?? '';
  let data: unknown = [];
  if (url.includes('exchange-rates')) {
    data = { USD: { rateBs: '100', manual: false }, EUR: { rateBs: '110', manual: false } };
  } else if (url === '/whatsapp-link/status') {
    data = { disponible: true, vinculado: false, planPermitido: true };
  } else if (url.includes('status')) {
    data = { vinculado: false };
  } else if (url.includes('club-link')) {
    data = { clubs: [], links: [], linkedClubs: [], activeCode: null };
  }
  return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
};

const context = {
  user: { id: 'preview', role: 'OWNER', name: 'Usuario de prueba', hasLockPin: true },
  restaurant: {
    id: 'preview', slug: 'demo', name: 'Restaurante de prueba',
    businessType: 'RESTAURANT', baseCurrency: 'USD', currencySymbol: '$',
    subscriptionPlan: 'CONTROL', paymentMethodsConfig: {}, theme: {},
    serviceChargeChannels: [], deliveryPricingMode: 'DISABLED', isDemo: false,
  },
  refresh: async () => {},
};

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <AuthContext.Provider value={context as React.ContextType<typeof AuthContext>}>
      <div style={{ padding: 'clamp(12px, 3vw, 40px)', background: '#f6f8fb', minHeight: '100vh' }}>
        <p style={{ maxWidth: 1280, margin: '0 auto 16px', color: '#64748b', fontSize: 13 }}>
          Vista previa · Datos de ejemplo · Los cambios no se guardan
        </p>
        {window.location.pathname.includes('assistant.html') || new URLSearchParams(window.location.search).get('section') === 'asistente' ? <div className="qa-preview-layout"><aside className="qa-preview-nav"><strong>QuickTap</strong><nav aria-label="Menú lateral">{visibleNavLinks('OWNER', context.restaurant, true, true).map(({ to, label, icon: Icon }) => <a key={to} href={to === '/admin/assistant' ? '/dev/assistant.html' : to === '/admin/settings' ? '/dev/settings.html' : to} aria-current={to === '/admin/assistant' ? 'page' : undefined}><Icon size={18} />{label}</a>)}</nav></aside><AssistantPage /></div> : <SettingsPage />}
      </div>
    </AuthContext.Provider>
  </MemoryRouter>,
);

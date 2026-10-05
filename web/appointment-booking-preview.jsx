// Vista aislada: nunca crea reservas ni modifica datos reales.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { api } from './src/api/client';
import AppointmentBookingPage from './src/pages/public/AppointmentBookingPage';
import './src/index.css';

const catalog = {
  business: { name: 'Espacio Bienestar', logoUrl: null, baseCurrency: 'EUR' },
  settings: { publicTitle: 'Un espacio para ti', publicDescription: 'Acompañamiento profesional, a tu ritmo. Encuentra el momento que mejor se adapte a ti.', primaryColor: '#008edf', accentColor: '#00b889', backgroundColor: '#f5f8fc', timezone: 'America/Caracas', collectNotes: true, requireManualApproval: true },
  services: [
    { id: 's1', name: 'Consulta inicial', description: 'Un primer encuentro para conocerte y definir el mejor acompañamiento.', durationMinutes: 60, price: '45', color: '#008edf' },
    { id: 's2', name: 'Sesión de seguimiento', description: 'Un espacio para continuar trabajando en tus objetivos.', durationMinutes: 45, price: '35', color: '#00b889' },
    { id: 's3', name: 'Orientación familiar', description: 'Conversaciones para fortalecer los vínculos y encontrar nuevas herramientas.', durationMinutes: 75, price: '60', color: '#8d73d4' },
  ],
  professionals: [
    { id: 'p1', name: 'Ana Martínez', specialty: 'Psicología clínica', description: 'Acompañamiento cercano, centrado en tu bienestar y crecimiento personal.', services: [{ serviceId: 's1' }, { serviceId: 's2' }] },
    { id: 'p2', name: 'Carlos Mendoza', specialty: 'Orientación familiar', description: 'Un enfoque práctico y humano para avanzar con claridad.', services: [{ serviceId: 's1' }, { serviceId: 's3' }] },
  ],
};

api.defaults.adapter = async config => {
  let data = catalog;
  if (config.url?.endsWith('/slots')) {
    const date = new Date(); date.setDate(date.getDate() + 1);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    data = [9, 10, 11, 14, 15].map(hour => ({ startsAt: `${day}T${String(hour).padStart(2, '0')}:00:00-04:00`, endsAt: `${day}T${String(hour + 1).padStart(2, '0')}:00:00-04:00` }));
  } else if (config.url?.endsWith('/requests')) data = { status: 'REQUESTED' };
  return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
};

createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/citas/demo-citas']}><div style={{ padding: 8, textAlign: 'center', background: '#dff2ff', color: '#06436b', fontSize: 12 }}>Vista previa · Datos ficticios · No se envían reservas reales</div><AppointmentBookingPage/></MemoryRouter>);

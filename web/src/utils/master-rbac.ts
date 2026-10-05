import type { MasterRole } from '@/pages/master/master-nav';

export const MASTER_ROLE_LABELS: Record<MasterRole, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  SUPPORT: 'Soporte',
  FINANCE: 'Finanzas',
  AUDITOR: 'Auditor',
};

export const MASTER_ROLE_RULES: Record<MasterRole, string> = {
  ADMIN: 'Control total: usuarios, configuración global, locales, finanzas y eliminaciones.',
  MANAGER: 'Opera locales, catálogos, cotizaciones y soporte; no administra el sistema ni usuarios Máster.',
  SUPPORT: 'Consulta locales, ingresa para asistir y corrige accesos; no modifica cobros ni configuración.',
  FINANCE: 'Gestiona comprobantes, suscripciones, cargos y datos de cobro de cada local.',
  AUDITOR: 'Acceso de solo lectura a métricas, locales y consumo de IA.',
};

export function canManagePlatform(role: MasterRole) {
  return role === 'ADMIN';
}

export function canManageRestaurant(role: MasterRole) {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canSupportRestaurant(role: MasterRole) {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'SUPPORT';
}

export function canManageRestaurantBilling(role: MasterRole) {
  return role === 'ADMIN' || role === 'FINANCE';
}

export function canSendRestaurantReminder(role: MasterRole) {
  return role !== 'AUDITOR';
}

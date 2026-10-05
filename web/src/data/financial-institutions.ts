import catalog from '../../../src/data/financial-institutions.json';
export const FINANCIAL_INSTITUTIONS = catalog;
export type FinancialInstitution = (typeof catalog)[number];
export const INSTITUTION_GROUPS = { VE: 'Venezuela', INTERNATIONAL: 'Internacionales', PLATFORM: 'Plataformas' };
export const findInstitution = (id?: string | null) => catalog.find(item => item.id === id);

import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { uploadSpreadsheet } from '../../middlewares/upload.middleware';
import { accountingController } from './accounting.controller';

/**
 * Base: /api/v1/office — vertical Administrativo (contabilidad multi-empresa).
 *
 * Va en /office y no en /accounting porque ese ya es el módulo contable del vertical de
 * restaurantes, que es otra cosa: aquel lleva los libros de UN negocio, este los de varios.
 *
 * Todo cuelga de /companies/:companyId y el service verifica que esa empresa sea del inquilino
 * del token: el companyId viaja en la URL, así que sin ese chequeo un id ajeno abriría los
 * libros de otro.
 */
const router = Router();
router.use(tenantGuard);

router.get('/companies', accountingController.listCompanies);
router.post('/companies', requireRole('OWNER', 'ADMIN'), accountingController.createCompany);
router.patch('/companies/:companyId', requireRole('OWNER', 'ADMIN'), accountingController.updateCompany);

router.get('/companies/:companyId/dashboard', accountingController.dashboard);
router.get('/companies/:companyId/accounts', accountingController.listAccounts);
router.post('/companies/:companyId/accounts', requireRole('OWNER', 'ADMIN'), accountingController.createAccount);

router.get('/companies/:companyId/entries', accountingController.listEntries);
router.post('/companies/:companyId/entries', requireRole('OWNER', 'ADMIN'), accountingController.createEntry);
// Anular deja rastro (crea el contra-asiento), así que se restringe igual que crear.
router.post('/companies/:companyId/entries/:entryId/void', requireRole('OWNER', 'ADMIN'), accountingController.voidEntry);

router.get('/companies/:companyId/contacts', accountingController.listContacts);
router.post('/companies/:companyId/contacts', requireRole('OWNER', 'ADMIN'), accountingController.createContact);

router.get('/companies/:companyId/reports', accountingController.reports);

// Carga masiva por Excel: la plantilla baja llena con lo que la empresa tenga, y la subida
// escribe cuentas, contactos y asientos en una sola transacción.
router.get('/companies/:companyId/import-template', accountingController.downloadImportTemplate);
router.post('/companies/:companyId/import', requireRole('OWNER', 'ADMIN'), uploadSpreadsheet, accountingController.importExcel);

export const officeRoutes = router;

import { Router } from 'express';
import { authRateLimit } from '../../middlewares/rate-limit.middleware';
import { optimizeImage, uploadShopPaymentProof } from '../../middlewares/upload.middleware';
import { walletController } from './wallet.controller';
import { walletGuard } from './wallet.middleware';

/**
 * Base: /api/v1/public/wallet — QuickTap Wallet, el portal del cliente final.
 *
 * Público: quien entra acá no tiene cuenta en ningún negocio, se identifica con su teléfono y su
 * cédula. El login lleva el mismo límite de tráfico que el resto de las rutas de credenciales
 * del proyecto: no bloquea a ningún cliente, solo frena el intento automatizado de adivinar
 * cédulas a gran escala.
 */
const router = Router();

router.post('/login', authRateLimit, walletController.login);
router.get('/me', walletGuard, walletController.me);
router.get('/reports', walletGuard, walletController.misReportes);
router.get('/tickets', walletGuard, walletController.entradas);
// Sin guard a propósito: es el directorio de tiendas de la plataforma, no datos de nadie.
router.get('/stores', walletController.tiendas);
router.get('/sales/:id/methods', walletGuard, walletController.metodos);
router.post('/sales/:id/payments', walletGuard, walletController.reportar);
router.post('/proof', walletGuard, uploadShopPaymentProof, optimizeImage(1200, 1200), walletController.subirComprobante);

export default router;

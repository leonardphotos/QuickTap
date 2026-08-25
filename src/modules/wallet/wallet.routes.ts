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
// El ingreso nuevo: clave propia, creada tras verificar el teléfono con un código por SMS.
// Todas bajo el mismo límite de credenciales — status incluido, que aunque solo diga "tiene
// clave o no", enumerado a gran escala también cuenta una historia.
router.post('/status', authRateLimit, walletController.estado);
router.post('/send-code', authRateLimit, walletController.enviarCodigo);
router.post('/verify-code', authRateLimit, walletController.verificarCodigo);
router.post('/set-password', authRateLimit, walletController.crearClave);
router.post('/login-password', authRateLimit, walletController.loginConClave);
router.get('/me', walletGuard, walletController.me);
router.get('/reports', walletGuard, walletController.misReportes);
router.get('/tickets', walletGuard, walletController.entradas);
router.get('/history', walletGuard, walletController.historial);
router.post('/push-tokens', walletGuard, walletController.registrarAparato);
// Sin guard a propósito: es el directorio de tiendas de la plataforma, no datos de nadie.
router.get('/stores', walletController.tiendas);
router.get('/sales/:id/methods', walletGuard, walletController.metodos);
router.post('/sales/:id/payments', walletGuard, walletController.reportar);
router.post('/proof', walletGuard, uploadShopPaymentProof, optimizeImage(1200, 1200), walletController.subirComprobante);

export default router;

import type { CapacitorConfig } from '@capacitor/cli';

/**
 * QuickTap Wallet para Android — la misma filosofía de carcasa que la app del panel
 * (web/capacitor.config.ts): abre el sitio EN VIVO, así cada despliegue del portal llega a
 * los teléfonos sin publicar APK nueva. appId distinto para poder convivir instalada junto a
 * la app del panel en el mismo teléfono.
 *
 * El `?app=wallet` de la URL es lo que le dice a la SPA qué carcasa es (ver
 * web/src/utils/native-platform.ts#appFlavor): sin él, un arranque en frío en '/' mandaría
 * al login del panel de negocios.
 */
const config: CapacitorConfig = {
  appId: 'club.quicktap.wallet',
  appName: 'QuickTap Wallet',
  webDir: 'www',
  server: {
    url: 'https://quicktap.club/wallet?app=wallet',
    cleartext: false,
  },
};

export default config;

import type { CapacitorElectronConfig } from '@capacitor-community/electron';

// Tipado como CapacitorElectronConfig (no el CapacitorConfig plano de @capacitor/cli) porque
// este mismo archivo se copia dentro de electron/ (ver electron/tsconfig.json) y se
// typechequea ahí — solo ese tipo declara la sección `electron` de abajo.

/**
 * La app de Android es una carcasa que abre el sitio en vivo (`CAP_SERVER_URL`), no una copia
 * del panel: así cada despliegue llega solo a los teléfonos, sin reinstalar nada. Se activa por
 * variable de entorno y NO por defecto, porque este mismo archivo lo usa Electron, que sí
 * empaqueta el panel adentro y se actualiza por su cuenta (ver electron/).
 *
 * Se define en `npm run android:sync` (web/package.json).
 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorElectronConfig = {
  appId: 'club.quicktap.app',
  appName: 'QuickTap',
  webDir: 'dist',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          // Solo HTTPS: nada de tráfico en claro contra el backend.
          cleartext: false,
        },
      }
    : {}),
  electron: {
    trayIconAndMenuEnabled: true,
    splashScreenEnabled: false,
  },
};

export default config;

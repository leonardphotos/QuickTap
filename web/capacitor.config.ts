import type { CapacitorElectronConfig } from '@capacitor-community/electron';

// Tipado como CapacitorElectronConfig (no el CapacitorConfig plano de @capacitor/cli) porque
// este mismo archivo se copia dentro de electron/ (ver electron/tsconfig.json) y se
// typechequea ahí — solo ese tipo declara la sección `electron` de abajo.
const config: CapacitorElectronConfig = {
  appId: 'club.quicktap.app',
  appName: 'QuickTap',
  webDir: 'dist',
  electron: {
    trayIconAndMenuEnabled: true,
    splashScreenEnabled: false,
  },
};

export default config;

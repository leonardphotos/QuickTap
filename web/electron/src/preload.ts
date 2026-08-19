require('./rt/electron-rt');

import { contextBridge, Notification } from 'electron';

// Puente hacia el renderer (ver web/src/utils/electronBridge.ts): la notificación nativa
// se dispara desde acá porque el script de preload tiene acceso a Electron/Node aunque la
// ventana tenga contextIsolation activado — no hace falta pasar por IPC al proceso principal.
contextBridge.exposeInMainWorld('electronBridge', {
  isElectron: true,
  notify: (payload: { title: string; body: string }) => {
    if (!Notification.isSupported()) return;
    new Notification({ title: payload.title, body: payload.body }).show();
  },
});

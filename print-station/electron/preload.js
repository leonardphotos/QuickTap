/**
 * Puente hacia la página de la estación (index.html, servida desde el sitio):
 * expone las impresoras instaladas en Windows y la impresión silenciosa, que
 * el navegador solo no puede hacer. La página detecta `window.estacionNativa`
 * y, si existe, imprime directo sin diálogo — como una terminal de verdad.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('estacionNativa', {
  listarImpresoras: () => ipcRenderer.invoke('listar-impresoras'),
  // deviceName null = la impresora predeterminada del sistema.
  imprimir: (deviceName) => ipcRenderer.invoke('imprimir-silencioso', deviceName || null),
});

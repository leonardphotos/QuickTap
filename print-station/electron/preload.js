/**
 * Puente hacia la página de la estación (index.html, servida desde el sitio):
 * expone las impresoras instaladas en Windows y la impresión silenciosa, que
 * el navegador solo no puede hacer. La página detecta `window.estacionNativa`
 * y, si existe, imprime directo sin diálogo — como una terminal de verdad.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('estacionNativa', {
  // Versión del INSTALABLE (distinta de la de la página, que se actualiza sola). Sin esto no
  // había forma de saber si una PC tenía el .exe viejo: la página se veía nueva y el arreglo
  // que vive en el ejecutable no estaba, y desde fuera parecía que nada había servido.
  version: '1.9.0',
  listarImpresoras: () => ipcRenderer.invoke('listar-impresoras'),
  // deviceName null = la impresora predeterminada del sistema.
  // `papel` = {anchoMm, altoMm} del ticket ya medido: sin esto la impresora usa la hoja del
  // driver y rellena con blanco hasta completarla.
  imprimir: (deviceName, papel) => ipcRenderer.invoke('imprimir-silencioso', deviceName || null, papel || null),
  // ESC/POS crudo al spooler de Windows: el papel avanza solo lo que ocupa la comanda,
  // sin depender del tamaño de hoja que tenga configurado el driver.
  imprimirCrudo: (deviceName, base64) => ipcRenderer.invoke('imprimir-crudo', deviceName || null, base64),

  /**
   * Impresora fiscal (The Factory HKA / Aclas PP9-PLUS) — ver main.js. Es un camino
   * aparte del de las comanderas: otro puerto, otro protocolo y un driver propio.
   * `detectar` recorre los puertos COM y devuelve el que tenga la fiscal, con su
   * modelo y serial; `status` lee el estado vigente (papel, tapa, documento a medias).
   * Sin impresora fiscal ambas responden { ok: false, codigo }, nunca lanzan: la
   * estación tiene que seguir imprimiendo comandas igual.
   */
  fiscal: {
    detectar: () => ipcRenderer.invoke('fiscal-detectar'),
    status: (puerto) => ipcRenderer.invoke('fiscal-status', puerto || null),
    rutaConfig: () => ipcRenderer.invoke('fiscal-config-ruta'),
    // Emite una factura fiscal REAL: queda registrada de forma permanente en la memoria
    // fiscal de la máquina. Devuelve { ok, numeroFactura, serialMaquina } o { ok:false, codigo }.
    factura: (venta, puerto) => ipcRenderer.invoke('fiscal-factura', venta, puerto || null),
  },
});

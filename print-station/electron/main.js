/**
 * Envoltorio de escritorio de la Estación de Impresión.
 *
 * Sigue el mismo patrón que las otras apps nativas: abre la estación servida
 * desde el sitio (https://quicktap.club/impresion/), así cada deploy le llega
 * a las PCs instaladas sin reinstalar nada. Al ser el mismo origen que la API,
 * tampoco necesita entrada propia en CORS_ORIGINS.
 */
const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');

const ESTACION_URL = 'https://quicktap.club/impresion/';

let win = null;

/**
 * Carga la estación SALTÁNDOSE LA CACHÉ.
 *
 * La app abre una página servida desde el sitio, así que un arreglo debería llegar con solo
 * reabrirla. En la práctica no siempre pasaba: Chromium se quedaba con la copia guardada y la
 * PC del local seguía imprimiendo con la versión vieja, sin forma de notarlo ni de forzar una
 * recarga — el menú está oculto, así que tampoco había F5. Acá se pide la página de nuevo
 * siempre; es un HTML de 100 KB una vez por arranque, no cuesta nada.
 */
function cargarEstacion() {
  if (!win || win.isDestroyed()) return;
  win.loadURL(ESTACION_URL, { extraHeaders: 'Cache-Control: no-cache\nPragma: no-cache\n' });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    icon: path.join(__dirname, 'appIcon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Expone las impresoras de Windows y la impresión sin diálogo (ver preload.js).
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  Menu.setApplicationMenu(null);

  // Web Serial (modo experimental directo a la térmica): Electron no trae UI de
  // selección de puerto, hay que resolverla acá o request() nunca responde.
  win.webContents.session.on('select-serial-port', (event, ports, _wc, callback) => {
    event.preventDefault();
    // La PC de impresión suele tener una sola impresora serial conectada.
    callback(ports[0]?.portId ?? '');
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => permission === 'serial');
  win.webContents.session.setDevicePermissionHandler((details) => details.deviceType === 'serial');

  // Sin internet al abrir (o un tropiezo del sitio): reintentar solo, la PC de
  // impresión no tiene a nadie apretando F5.
  win.webContents.on('did-fail-load', () => {
    setTimeout(cargarEstacion, 5000);
  });

  cargarEstacion();
  win.on('closed', () => { win = null; });
}

// Impresoras instaladas en el sistema, para que la página les asigne cocinas.
ipcMain.handle('listar-impresoras', async () => {
  if (!win || win.isDestroyed()) return [];
  const impresoras = await win.webContents.getPrintersAsync();
  return impresoras.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
});

/**
 * Un print() a la vez, en fila.
 *
 * Electron descarta una de dos impresiones simultáneas sobre el mismo webContents: de dos
 * print() solapados, uno vuelve con ok=false y ese papel no sale nunca. La página ya encola
 * sus trabajos, pero esto es la garantía real — nada que llegue por IPC puede solaparse,
 * venga de donde venga.
 */
let cola = Promise.resolve();

/** Una impresión, con red de seguridad por si el callback nunca vuelve. */
function imprimirUna(deviceName) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve(false);
    let resuelto = false;
    const fin = (ok) => {
      if (resuelto) return;
      resuelto = true;
      resolve(ok);
    };
    // Sin esto, una impresora apagada o en pausa puede dejar el callback colgado para siempre
    // y con él la cola entera: la estación quedaría muda hasta reiniciarla.
    const reloj = setTimeout(() => {
      console.error('La impresora no respondió en 20s; se sigue con el resto de la cola.');
      fin(false);
    }, 20000);
    try {
      win.webContents.print(
        { silent: true, printBackground: true, margins: { marginType: 'none' }, ...(deviceName ? { deviceName } : {}) },
        (ok, motivo) => {
          clearTimeout(reloj);
          if (!ok && motivo !== 'cancelled') console.error('Fallo imprimiendo:', motivo || '(sin motivo)');
          fin(ok);
        },
      );
    } catch (err) {
      clearTimeout(reloj);
      console.error('print() lanzó:', err.message);
      fin(false);
    }
  });
}

// Imprime la página actual (el CSS de la estación deja visible solo el ticket)
// directo a la impresora indicada, sin diálogo — el modo terminal.
ipcMain.handle('imprimir-silencioso', (_event, deviceName) => {
  const trabajo = cola.then(async () => {
    const ok = await imprimirUna(deviceName);
    if (ok) return true;
    // Un solo reintento: el ok=false de una carrera perdida se resuelve reintentando, y el de
    // una impresora que de verdad no está fallará igual la segunda vez sin trabar nada.
    await new Promise((r) => setTimeout(r, 600));
    return imprimirUna(deviceName);
  });
  // La cola nunca se rompe: un trabajo que falla no puede dejar sin imprimir a los siguientes.
  cola = trabajo.catch(() => false);
  return trabajo;
});

app.whenReady().then(() => {
  createWindow();
  // Sin menú no hay atajos, así que se registran a mano: si alguna vez la pantalla queda
  // pegada o desactualizada, F5 la vuelve a traer sin desinstalar nada.
  globalShortcut.register('F5', cargarEstacion);
  globalShortcut.register('CommandOrControl+R', cargarEstacion);
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (win === null) createWindow(); });

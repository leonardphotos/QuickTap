/**
 * Envoltorio de escritorio de la Estación de Impresión.
 *
 * Sigue el mismo patrón que las otras apps nativas: abre la estación servida
 * desde el sitio (https://quicktap.club/impresion/), así cada deploy le llega
 * a las PCs instaladas sin reinstalar nada. Al ser el mismo origen que la API,
 * tampoco necesita entrada propia en CORS_ORIGINS.
 */
const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
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

/**
 * Una impresión, con red de seguridad por si el callback nunca vuelve.
 *
 * `papel` viene medido por la página (el alto real del ticket). Se lo pasamos como pageSize
 * para que la hoja mida lo que mide la comanda: si no, manda el tamaño configurado en el
 * driver de Windows —normalmente una hoja larga— y la impresora rellena el resto con papel en
 * blanco. Eso era medio metro desperdiciado por comanda, y no hay CSS que lo arregle porque la
 * decisión es del driver, no del documento.
 */
function imprimirUna(deviceName, papel) {
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
        {
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' },
          // En micras. Se ignora un alto absurdo (medida rara, ticket vacío) antes que mandarle
          // a la impresora una hoja imposible.
          ...(papel && papel.altoMm >= 20 && papel.altoMm <= 2000
            ? { pageSize: { width: Math.round(papel.anchoMm * 1000), height: Math.round(papel.altoMm * 1000) } }
            : {}),
          ...(deviceName ? { deviceName } : {}),
        },
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
ipcMain.handle('imprimir-silencioso', (_event, deviceName, papel) => {
  const trabajo = cola.then(async () => {
    const ok = await imprimirUna(deviceName, papel);
    if (ok) return true;
    // Un solo reintento, y SIN el tamaño a medida: si falló por una carrera perdida, reintentar
    // lo resuelve igual; y si el driver no acepta hojas personalizadas, así al menos sale el
    // ticket con el tamaño que él tenga configurado. Peor es no imprimir.
    await new Promise((r) => setTimeout(r, 600));
    return imprimirUna(deviceName, null);
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

/* ============================================================
   Impresión térmica directa (ESC/POS crudo)
   ============================================================
   El driver de la Xprinter ignora el tamaño de hoja que le pide Chromium y usa
   el suyo, así que un ticket de 6cm sale igual en una hoja larga y el resto
   avanza en blanco. Con ESC/POS no hay hoja: hay una tira y un corte, y el papel
   que avanza es el que ocupa la comanda.

   Se manda por el spooler de Windows con datatype RAW (winspool WritePrinter),
   vía un PowerShell de una sola pasada. Se eligió así y no un módulo nativo de
   Node porque un módulo nativo hay que compilarlo por versión de Electron y por
   arquitectura, y esto tiene que poder instalarse en la PC de cualquier local
   sin herramientas de compilación. PowerShell viene en todo Windows 10/11.

   Funciona igual con una impresora local o compartida desde otra PC: el nombre
   que devuelve getPrintersAsync ya es el que entiende OpenPrinter.
   ============================================================ */
const RAW_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class QuickTapRaw {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
  public static string Send(string printer, string file) {
    byte[] data = File.ReadAllBytes(file);
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "No se pudo abrir la impresora (" + Marshal.GetLastWin32Error() + ")";
    string err = null;
    DOCINFO di = new DOCINFO(); di.pDocName = "QuickTap comanda"; di.pDataType = "RAW";
    if (StartDocPrinter(h, 1, di)) {
      if (StartPagePrinter(h)) {
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        Marshal.Copy(data, 0, p, data.Length);
        int written;
        if (!WritePrinter(h, p, data.Length, out written)) err = "WritePrinter fallo (" + Marshal.GetLastWin32Error() + ")";
        Marshal.FreeCoTaskMem(p);
        EndPagePrinter(h);
      } else err = "StartPagePrinter fallo";
      EndDocPrinter(h);
    } else err = "StartDocPrinter fallo (" + Marshal.GetLastWin32Error() + ")";
    ClosePrinter(h);
    return err;
  }
}
"@
$r = [QuickTapRaw]::Send($env:QT_PRINTER, $env:QT_FILE)
if ($r) { Write-Error $r; exit 1 }
exit 0
`;

ipcMain.handle('imprimir-crudo', async (_event, deviceName, base64) => {
  if (process.platform !== 'win32') return { ok: false, error: 'La impresión térmica directa solo funciona en Windows.' };
  if (!deviceName) return { ok: false, error: 'Falta elegir la impresora.' };

  const tmp = path.join(os.tmpdir(), `quicktap-${Date.now()}-${Math.round(Math.random() * 1e9)}.bin`);
  try {
    fs.writeFileSync(tmp, Buffer.from(base64, 'base64'));
  } catch (err) {
    return { ok: false, error: 'No se pudo preparar el trabajo: ' + err.message };
  }

  return new Promise((resolve) => {
    // La impresora y el archivo van por variables de entorno y no dentro del script:
    // un nombre con comillas o acentos rompería el PowerShell si se interpolara.
    const ps = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', RAW_PS],
      { env: { ...process.env, QT_PRINTER: deviceName, QT_FILE: tmp }, timeout: 20000, windowsHide: true },
      (err, _stdout, stderr) => {
        fs.rmSync(tmp, { force: true });
        if (err) {
          const motivo = (stderr || err.message || '').split('\n')[0].trim();
          console.error('Impresión térmica directa falló:', motivo);
          resolve({ ok: false, error: motivo || 'No se pudo imprimir en modo térmico.' });
          return;
        }
        resolve({ ok: true });
      },
    );
    ps.on('error', (err) => {
      fs.rmSync(tmp, { force: true });
      resolve({ ok: false, error: 'No se pudo ejecutar PowerShell: ' + err.message });
    });
  });
});

/* ============================================================
   Impresión fiscal (The Factory HKA / Aclas PP9-PLUS)
   ============================================================
   La comandera imprime en papel y ya; la fiscal además le asigna a la venta un
   número de factura y un número de control que el SENIAT exige. Es otro
   protocolo y otro puerto (RS232/USB-serie), así que no comparte NADA con el
   camino de las comanderas de arriba — solo convive con él.

   El puente es fiscal/fiscal.ps1, que carga el driver oficial TfhkaNet.dll (ver
   las notas del propio script). Acá solo se lo invoca y se parsea su JSON.
   ============================================================ */

/**
 * Ruta del script y de la DLL, en desarrollo y dentro del .exe empaquetado.
 *
 * Ya empaquetado, __dirname apunta DENTRO de app.asar, y ni PowerShell ni el
 * driver .NET pueden leer de ahí: para ellos el asar es un archivo, no una
 * carpeta. Por eso fiscal/ va en `asarUnpack` (ver electron-builder.config.json)
 * y acá se apunta a la copia real en disco. En desarrollo no hay asar en la
 * ruta y el replace no hace nada.
 */
function rutaFiscal(archivo) {
  return path.join(__dirname.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), 'fiscal', archivo);
}

/**
 * La DLL está compilada 32BITREQUIRED, así que en un Windows de 64 bits hay que
 * usar el PowerShell de 32 bits o Add-Type revienta con BadImageFormatException.
 * SysWOW64 es, contra toda intuición, la carpeta de 32 bits.
 */
function powershell32() {
  const sysWow = path.join(process.env.SystemRoot || 'C:\\Windows', 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(sysWow) ? sysWow : 'powershell.exe';
}

/** Configuración editable por el usuario. Vive en %APPDATA% y no dentro de la
 *  carpeta de instalación: en Program Files haría falta permiso de administrador
 *  para cada ajuste. Se crea sola la primera vez. */
function rutaConfigFiscal() {
  return path.join(app.getPath('userData'), 'fiscal.config.json');
}

const CONFIG_FISCAL_DEFAULT = {
  // Vacío = detectar sola recorriendo los puertos. Con un valor ("COM4"), se
  // prueba ese primero y solo se escanea si no responde.
  puerto: '',
  // Cuánto se espera a que un puerto conteste durante el escaneo. La fiscal
  // responde en cientos de milisegundos; lo que tarda más está ocupado o no es.
  timeoutProbeMs: 5000,
  // Puertos que NO hay que tocar durante el escaneo: abrir el COM de otro
  // aparato (una balanza, un lector) puede dejarlo trabado.
  ignorarPuertos: [],
};

function leerConfigFiscal() {
  const ruta = rutaConfigFiscal();
  try {
    if (fs.existsSync(ruta)) {
      return { ...CONFIG_FISCAL_DEFAULT, ...JSON.parse(fs.readFileSync(ruta, 'utf8')) };
    }
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, JSON.stringify(CONFIG_FISCAL_DEFAULT, null, 2), 'utf8');
  } catch (err) {
    console.error('No se pudo leer/crear fiscal.config.json:', err.message);
  }
  return { ...CONFIG_FISCAL_DEFAULT };
}

/** Corre fiscal.ps1 sobre UN puerto y devuelve su JSON ya parseado. */
function correrFiscalPs(accion, puerto, timeoutMs) {
  return new Promise((resolve) => {
    const args = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', rutaFiscal('fiscal.ps1'),
      '-Accion', accion,
      '-Puerto', puerto,
    ];
    execFile(powershell32(), args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      const salida = (stdout || '').trim();
      if (salida) {
        try {
          return resolve(JSON.parse(salida));
        } catch {
          // Sigue al manejo de error de abajo: una salida que no es JSON casi
          // siempre es PowerShell quejándose antes de que el script arrancara.
        }
      }
      if (err && err.killed) {
        return resolve({ ok: false, codigo: 'TIMEOUT', error: `${puerto} no respondió a tiempo.` });
      }
      const motivo = (stderr || (err && err.message) || salida || '').split('\n')[0].trim();
      resolve({ ok: false, codigo: 'FALLO_PS', error: motivo || 'No se pudo consultar la impresora fiscal.' });
    });
  });
}

/** Puertos COM del sistema, por el mismo PowerShell de 32 bits. */
function listarPuertosCom() {
  return new Promise((resolve) => {
    const args = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', '[System.IO.Ports.SerialPort]::GetPortNames() -join ","',
    ];
    execFile(powershell32(), args, { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      const lista = (stdout || '').trim().split(',').map((p) => p.trim()).filter(Boolean);
      // COM1..COM9 primero y luego por número: en la práctica el USB-serie de la
      // fiscal cae en los números bajos, así que se encuentra antes.
      resolve([...new Set(lista)].sort((a, b) => (parseInt(a.slice(3), 10) || 0) - (parseInt(b.slice(3), 10) || 0)));
    });
  });
}

/**
 * Encuentra la impresora fiscal y devuelve puerto, modelo y serial.
 *
 * Si hay un puerto fijo en la configuración se prueba ese primero (el caso
 * normal: una sola invocación). Solo si no responde se recorren los demás, uno
 * por uno y cada uno con su propio timeout — así un COM ocupado que deje la
 * llamada colgada no arrastra al resto del escaneo.
 */
async function detectarFiscal() {
  if (process.platform !== 'win32') {
    return { ok: false, codigo: 'NO_WINDOWS', error: 'La impresión fiscal solo funciona en Windows.' };
  }
  const cfg = leerConfigFiscal();
  const intentados = [];

  if (cfg.puerto) {
    const r = await correrFiscalPs('probe', cfg.puerto, cfg.timeoutProbeMs);
    if (r.ok) return { ...r, configurado: true };
    intentados.push({ puerto: cfg.puerto, ...r });
  }

  const puertos = (await listarPuertosCom()).filter(
    (p) => p !== cfg.puerto && !(cfg.ignorarPuertos || []).includes(p),
  );
  for (const p of puertos) {
    const r = await correrFiscalPs('probe', p, cfg.timeoutProbeMs);
    if (r.ok) return { ...r, configurado: false };
    intentados.push({ puerto: p, ...r });
  }

  // Sin impresora fiscal la estación tiene que seguir imprimiendo comandas: esto
  // se reporta, no se lanza.
  return {
    ok: false,
    codigo: 'NO_ENCONTRADA',
    error: puertos.length === 0 && !cfg.puerto
      ? 'No hay puertos COM disponibles en esta PC.'
      : 'No se encontró ninguna impresora fiscal en los puertos disponibles.',
    intentados,
  };
}

ipcMain.handle('fiscal-detectar', () => detectarFiscal());

ipcMain.handle('fiscal-status', async (_event, puerto) => {
  if (process.platform !== 'win32') {
    return { ok: false, codigo: 'NO_WINDOWS', error: 'La impresión fiscal solo funciona en Windows.' };
  }
  const cfg = leerConfigFiscal();
  const destino = puerto || cfg.puerto;
  if (!destino) {
    const encontrada = await detectarFiscal();
    if (!encontrada.ok) return encontrada;
    return correrFiscalPs('status', encontrada.puerto, cfg.timeoutProbeMs);
  }
  return correrFiscalPs('status', destino, cfg.timeoutProbeMs);
});

/** Para poder decirle al usuario dónde está el archivo que tiene que editar. */
ipcMain.handle('fiscal-config-ruta', () => rutaConfigFiscal());

# =============================================================================
#  Diagnóstico paso a paso de la impresora fiscal
# =============================================================================
#  probar-fiscal.ps1 responde "la encontré" o "no la encontré". Cuando la
#  respuesta es "no" y no está claro por qué, este script hace el mismo camino
#  pero mostrando cada paso por separado — así se ve si el problema es el
#  archivo, el puerto o la impresora, en vez de tener que adivinar entre los
#  tres.
#
#  Se lanza con DIAGNOSTICO.bat (no con doble clic sobre este archivo).
# =============================================================================

param([string]$Puerto = 'COM3')

$ErrorActionPreference = 'Continue'
$dll = Join-Path $PSScriptRoot 'TfhkaNet.dll'

function Titulo($t) { Write-Host ''; Write-Host $t -ForegroundColor Cyan }
function Ok($t)     { Write-Host "  [OK]    $t" -ForegroundColor Green }
function Falla($t)  { Write-Host "  [FALLA] $t" -ForegroundColor Red }
function Info($t)   { Write-Host "          $t" -ForegroundColor DarkGray }

Write-Host ''
Write-Host '===== DIAGNOSTICO IMPRESORA FISCAL =====' -ForegroundColor White

# --- 1. Entorno -------------------------------------------------------------
Titulo '1. Entorno'
$bits = if ([IntPtr]::Size -eq 4) { '32' } else { '64' }
if ($bits -eq '32') { Ok "PowerShell de 32 bits (correcto)" }
else { Falla "PowerShell de 64 bits — la DLL es de 32 y no va a cargar. Usa DIAGNOSTICO.bat." }
Info "Version de PowerShell: $($PSVersionTable.PSVersion)"
Info "Carpeta: $PSScriptRoot"

# --- 2. Archivos ------------------------------------------------------------
Titulo '2. Archivos'
if (Test-Path $dll) {
  $f = Get-Item $dll
  Ok "TfhkaNet.dll presente ($([math]::Round($f.Length/1KB)) KB)"
  # "Mark of the Web": el flag que Windows le pone a lo descargado y que impide
  # que .NET cargue el ensamblado.
  $zone = Get-Item $dll -Stream Zone.Identifier -ErrorAction SilentlyContinue
  if ($zone) {
    Falla 'La DLL esta BLOQUEADA por Windows (vino de una descarga)'
    Info 'Desbloqueando...'
    Unblock-File -Path $dll -ErrorAction SilentlyContinue
    $zone2 = Get-Item $dll -Stream Zone.Identifier -ErrorAction SilentlyContinue
    if ($zone2) { Falla 'No se pudo desbloquear automaticamente' }
    else { Ok 'Desbloqueada' }
  } else { Ok 'La DLL no esta bloqueada' }
} else {
  Falla "No existe TfhkaNet.dll en $PSScriptRoot"
  Read-Host "`nEnter para salir"; exit 1
}

# --- 3. Carga del driver ----------------------------------------------------
Titulo '3. Carga del driver (.NET)'
try {
  Add-Type -Path $dll -ErrorAction Stop
  Ok 'TfhkaNet.dll cargada'
} catch {
  Falla "No carga: $($_.Exception.Message)"
  if ($_.Exception.InnerException) { Info "Causa: $($_.Exception.InnerException.Message)" }
  Info 'Si dice BadImageFormat -> se esta usando el PowerShell equivocado.'
  Info 'Si dice que no se puede cargar el archivo -> sigue bloqueado o esta corrupto.'
  Read-Host "`nEnter para salir"; exit 1
}

# --- 4. Puertos -------------------------------------------------------------
Titulo '4. Puertos COM del sistema'
$puertos = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object -Unique
if ($puertos) { Ok ("Detectados: " + ($puertos -join ', ')) }
else { Falla 'No hay ningun puerto COM' }
if ($puertos -notcontains $Puerto) {
  Falla "$Puerto no aparece en la lista. Revisa que la impresora este encendida y conectada."
}

# --- 5. ¿El puerto está libre? ---------------------------------------------
#  Se abre el COM directo con .NET, sin el driver: si acá falla, el puerto lo
#  tiene tomado otro programa y no tiene sentido seguir.
Titulo "5. Puerto $Puerto disponible?"
try {
  $sp = New-Object System.IO.Ports.SerialPort $Puerto, 9600, 'None', 8, 'One'
  $sp.ReadTimeout = 1000
  $sp.Open()
  Ok "$Puerto se abre correctamente (esta libre)"
  $sp.Close()
  $sp.Dispose()
} catch {
  Falla "No se puede abrir $Puerto : $($_.Exception.Message)"
  Info 'Lo tiene tomado otro programa (el POS, el Fiscalizador de HKA, etc.)'
  Info 'o el puerto no existe. Cierra los otros programas y reintenta.'
}

# --- 6. El driver contra la impresora --------------------------------------
Titulo "6. Conexion con la impresora en $Puerto"
$fp = New-Object TfhkaNet.IF.VE.Tfhka
$abierto = $false
try {
  Write-Host '  OpenFpCtrl... ' -NoNewline
  $r = $fp.OpenFpCtrl($Puerto)
  if ($r) { Write-Host 'OK' -ForegroundColor Green; $abierto = $true }
  else {
    Write-Host 'devolvio FALSE' -ForegroundColor Red
    Info 'El driver no pudo tomar el puerto.'
  }

  if ($abierto) {
    Write-Host '  CheckFPrinter... ' -NoNewline
    $chk = $fp.CheckFPrinter()
    if ($chk) {
      Write-Host 'OK — HAY IMPRESORA FISCAL' -ForegroundColor Green
    } else {
      Write-Host 'devolvio FALSE' -ForegroundColor Red
      Info 'El puerto abrio pero la impresora no contesto.'
      Info 'Causas tipicas: sin papel (no acepta comandos), apagada,'
      Info 'o el cable esta en otro puerto.'
    }

    Write-Host '  ReadFpStatus... ' -NoNewline
    try {
      if ($fp.ReadFpStatus()) {
        Write-Host 'OK' -ForegroundColor Green
        $st = $fp.GetPrinterStatus()
        Info "Status: $($st.PrinterStatusCode) - $($st.PrinterStatusDescription)"
        Info "Error : $($st.PrinterErrorCode) - $($st.PrinterErrorDescription)"
      } else { Write-Host 'devolvio FALSE' -ForegroundColor Red }
    } catch { Write-Host "excepcion: $($_.Exception.Message)" -ForegroundColor Red }

    Write-Host '  GetS1PrinterData... ' -NoNewline
    try {
      $s1 = $fp.GetS1PrinterData()
      Write-Host 'OK' -ForegroundColor Green
      Info "Serial         : $($s1.RegisteredMachineNumber)"
      Info "RIF            : $($s1.RIF)"
      Info "Ultima factura : $($s1.LastInvoiceNumber)"
      Info "Fecha/hora     : $($s1.CurrentPrinterDateTime)"
    } catch { Write-Host "excepcion: $($_.Exception.Message)" -ForegroundColor Red }
  }
} catch {
  Falla "Excepcion: $($_.Exception.Message)"
} finally {
  if ($abierto) { try { $fp.CloseFpCtrl() } catch { } }
}

Write-Host ''
Write-Host '===== FIN DEL DIAGNOSTICO =====' -ForegroundColor White
Write-Host 'Mandale esta pantalla completa a QuickTap.' -ForegroundColor Yellow
Read-Host "`nEnter para salir"

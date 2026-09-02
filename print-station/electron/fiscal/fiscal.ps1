# =============================================================================
#  Puente hacia la impresora fiscal (The Factory HKA / Aclas PP9-PLUS)
# =============================================================================
#  Carga TfhkaNet.dll —el driver oficial de HKA— y expone sus operaciones como
#  un comando de consola que devuelve JSON, para que main.js lo invoque igual
#  que ya invoca PowerShell para el ESC/POS crudo (ver RAW_PS en main.js).
#
#  Por qué PowerShell y no un .exe propio en C#: TfhkaNet.dll es .NET Framework
#  4.0 puro (solo depende de mscorlib/System/System.Core), así que Add-Type la
#  carga tal cual. Un ejecutable propio habría que compilarlo en cada PC o
#  distribuir un binario más — justo lo que este proyecto ya evita a propósito
#  con los módulos nativos de Node.
#
#  IMPORTANTE: la DLL está marcada 32BITREQUIRED, así que hay que invocarla con
#  el PowerShell de 32 bits (C:\Windows\SysWOW64\WindowsPowerShell\v1.0\...).
#  Con el de 64 bits, Add-Type falla con BadImageFormatException. main.js ya
#  elige el correcto.
#
#  Una invocación = un puerto. La detección la orquesta main.js llamando a este
#  script una vez por puerto: así un puerto ocupado que deje la llamada colgada
#  se lo lleva su propio timeout, sin arrastrar al resto del escaneo.
# =============================================================================

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('probe', 'status')]
  [string]$Accion,

  [Parameter(Mandatory = $true)]
  [string]$Puerto,

  # Ruta a TfhkaNet.dll. Por defecto, junto a este script.
  [string]$Dll = ''
)

$ErrorActionPreference = 'Stop'

# Todo lo que salga por stdout tiene que ser el JSON y nada más: main.js lo
# parsea entero. Cualquier diagnóstico va por stderr.
function Salir-Json($obj) {
  $obj | ConvertTo-Json -Compress -Depth 6
  exit 0
}

function Salir-Error($mensaje, $codigo = 'ERROR') {
  Salir-Json @{ ok = $false; error = "$mensaje"; codigo = $codigo }
}

if ([string]::IsNullOrWhiteSpace($Dll)) {
  $Dll = Join-Path $PSScriptRoot 'TfhkaNet.dll'
}
if (-not (Test-Path $Dll)) {
  Salir-Error "No se encontró TfhkaNet.dll en '$Dll'." 'DLL_NO_ENCONTRADA'
}

# Windows marca lo que viene de internet ("Mark of the Web") y .NET se niega a
# cargar una DLL así marcada. Pasa siempre que el archivo llega por descarga o
# copiado desde otra PC, y el síntoma engaña: parece que la impresora no
# responde. Desbloquear es barato, así que se hace siempre.
try { Unblock-File -Path $Dll -ErrorAction SilentlyContinue } catch { }

try {
  Add-Type -Path $Dll
} catch {
  # Los dos casos típicos: la DLL bloqueada (arriba), o haberla invocado con el
  # PowerShell de 64 bits — la DLL es 32BITREQUIRED (ver nota del encabezado).
  $causa = if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message }
  Salir-Error "No se pudo cargar TfhkaNet.dll: $causa" 'DLL_NO_CARGA'
}

$fp = New-Object TfhkaNet.IF.VE.Tfhka
$abierto = $false

try {
  # OpenFpCtrl devuelve false si el puerto no existe o está tomado por otro
  # programa (el Fiscalizador de HKA abierto, por ejemplo).
  if (-not $fp.OpenFpCtrl($Puerto)) {
    Salir-Error "No se pudo abrir $Puerto (inexistente u ocupado por otro programa)." 'PUERTO_NO_ABRE'
  }
  $abierto = $true

  # CheckFPrinter es lo que distingue "hay algo conectado en este COM" de "hay
  # una impresora fiscal de HKA respondiendo": es la firma que buscamos al
  # recorrer los puertos.
  if (-not $fp.CheckFPrinter()) {
    Salir-Error "En $Puerto no responde una impresora fiscal." 'SIN_RESPUESTA'
  }

  # S1: datos de identidad y contadores del día. De acá salen el serial de la
  # máquina y el último número de factura, que es lo que hay que guardar junto
  # a la venta.
  $s1 = $fp.GetS1PrinterData()

  # SV: modelo y país del equipo.
  $modelo = $null
  try {
    $sv = $fp.GetSVPrinterData()
    if ($sv) { $modelo = "$($sv.Model)" }
  } catch {
    # Modelo es informativo: si esta consulta no está soportada por el firmware,
    # la detección sigue siendo válida — ya confirmamos la impresora con S1.
    $modelo = $null
  }

  if ($Accion -eq 'probe') {
    Salir-Json @{
      ok            = $true
      puerto        = $Puerto
      modelo        = $modelo
      serial        = "$($s1.RegisteredMachineNumber)"
      rif           = "$($s1.RIF)"
      ultimaFactura = "$($s1.LastInvoiceNumber)"
      fechaHora     = "$($s1.CurrentPrinterDateTime)"
    }
  }

  # status: además de lo anterior, el estado/error vigente de la impresora
  # (sin papel, tapa abierta, documento fiscal a medias, etc.).
  $estado = $null
  try {
    if ($fp.ReadFpStatus()) {
      $ps = $fp.GetPrinterStatus()
      $estado = @{
        statusCode  = "$($ps.PrinterStatusCode)"
        statusDesc  = "$($ps.PrinterStatusDescription)"
        errorCode   = "$($ps.PrinterErrorCode)"
        errorDesc   = "$($ps.PrinterErrorDescription)"
        errorValido = [bool]$ps.ErrorValidity
      }
    }
  } catch {
    $estado = $null
  }

  Salir-Json @{
    ok            = $true
    puerto        = $Puerto
    modelo        = $modelo
    serial        = "$($s1.RegisteredMachineNumber)"
    rif           = "$($s1.RIF)"
    ultimaFactura = "$($s1.LastInvoiceNumber)"
    fechaHora     = "$($s1.CurrentPrinterDateTime)"
    ventasDelDia  = "$($s1.TotalDailySales)"
    estado        = $estado
  }
} catch {
  Salir-Error $_.Exception.Message 'EXCEPCION'
} finally {
  # El puerto se cierra SIEMPRE: dejarlo tomado deja fuera de juego tanto a la
  # próxima factura como al Fiscalizador de HKA si el técnico lo necesita.
  if ($abierto) {
    try { $fp.CloseFpCtrl() } catch { }
  }
}

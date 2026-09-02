# =============================================================================
#  Emisión de factura fiscal (The Factory HKA / Aclas PP9-PLUS)
# =============================================================================
#  DE DÓNDE SALEN ESTOS COMANDOS
#  ------------------------------
#  No están inventados ni deducidos a ojo: se extrajeron del IL del propio
#  Fiscalizador_VE.exe de The Factory HKA —el software oficial que habla con
#  esta misma impresora— leyendo la secuencia de literales en orden de
#  ejecución de sus métodos `buttonFacturaIGTF_Click`, `button4_Click` y
#  `btnFijasAnulación_Click`. Es la implementación de referencia del
#  fabricante, no una reconstrucción.
#
#  SECUENCIA (confirmada contra ese IL)
#  ------------------------------------
#     iR*<rif>                     RIF del cliente
#     iS*<razón social>            nombre del cliente
#     i01..i04 <texto>             líneas extra del cliente (opcionales)
#     @<texto>                     comentario libre (opcional)
#     <tasa><precio><cant><desc>   un renglón por producto
#     1<NN>                        pago total con el medio NN
#     199                          cierra el documento fiscal
#
#  Formato del renglón de producto, de ancho fijo:
#     [1 carácter de tasa][10 dígitos de precio][8 dígitos de cantidad][texto]
#     precio  → 2 decimales implícitos  (10.00 -> "0000001000")
#     cantidad→ 3 decimales implícitos  (1.000 -> "00001000")
#  Los caracteres de tasa que usa el Fiscalizador son ' ' ! " # $ — el primero
#  es exento y el resto son las tasas 1..4 programadas en la impresora.
#
#  SI ALGO FALLA A MITAD
#  ---------------------
#  Se manda `7`, que anula el documento en curso (mismo comando que usa el
#  Fiscalizador en su botón de anulación). Es la diferencia entre dejar la
#  impresora trabada con un documento a medias —que bloquea la siguiente
#  venta— y dejarla lista para reintentar.
#
#  ADVERTENCIA: una factura que se emite queda grabada en la memoria fiscal de
#  forma PERMANENTE. No se borra; se corrige emitiendo una nota de crédito.
# =============================================================================

param(
  [Parameter(Mandatory = $true)][string]$Puerto,
  # El JSON de la venta llega por archivo y no por argumento: así no hay que
  # escapar comillas ni acentos en la línea de comandos.
  [Parameter(Mandatory = $true)][string]$JsonPath,
  [string]$Dll = '',
  # Cuando está presente NO se emite nada: solo se arma la secuencia y se
  # devuelve, para poder revisarla antes de gastar una factura real.
  [switch]$SoloSimular
)

$ErrorActionPreference = 'Stop'

function Salir-Json($o) { $o | ConvertTo-Json -Compress -Depth 8; exit 0 }
function Salir-Error($m, $c = 'ERROR', $extra = @{}) {
  Salir-Json (@{ ok = $false; error = "$m"; codigo = $c } + $extra)
}

# --- Entrada ----------------------------------------------------------------
if (-not (Test-Path $JsonPath)) { Salir-Error "No se encontró el JSON en '$JsonPath'." 'SIN_JSON' }
try { $venta = Get-Content $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json }
catch { Salir-Error "El JSON de la venta no se pudo leer: $($_.Exception.Message)" 'JSON_INVALIDO' }

if (-not $venta.items -or @($venta.items).Count -eq 0) {
  Salir-Error 'La venta no tiene productos.' 'SIN_ITEMS'
}

# --- Mapeos -----------------------------------------------------------------
# Carácter de tasa por renglón. Los nombres son los del JSON de QuickTap; a qué
# porcentaje corresponde cada tasa lo define la programación de la impresora
# (Tasa1/Tasa2/Tasa3), no este script.
$TASAS = @{
  'exenta'    = ' '
  'exento'    = ' '
  'general'   = '!'
  'reducida'  = '"'
  'adicional' = '#'
}

# Medio de pago -> número que la impresora tiene programado (comando 1NN).
# Sale de fiscal.config.json para no tener que tocar código cuando el local
# reordena sus medios de pago.
$MEDIOS_DEFAULT = @{
  'efectivo' = '01'
  'cheque'   = '07'
  'debito'   = '13'
  'credito'  = '14'
  'divisas'  = '24'   # medio marcado como divisa: es el que dispara el IGTF
}
$medios = $MEDIOS_DEFAULT.Clone()
if ($venta.medios_pago) {
  foreach ($k in $venta.medios_pago.PSObject.Properties.Name) {
    $medios[$k.ToLower()] = "$($venta.medios_pago.$k)"
  }
}

# --- Armado de la secuencia -------------------------------------------------
function Fmt-Precio($v) {
  # 10 dígitos, 2 decimales implícitos.
  $c = [long][math]::Round([double]$v * 100)
  if ($c -lt 0) { throw "Precio negativo: $v" }
  if ("$c".Length -gt 10) { throw "Precio fuera de rango: $v" }
  "$c".PadLeft(10, '0')
}
function Fmt-Cantidad($v) {
  # 8 dígitos, 3 decimales implícitos.
  $c = [long][math]::Round([double]$v * 1000)
  if ($c -le 0) { throw "Cantidad inválida: $v" }
  if ("$c".Length -gt 8) { throw "Cantidad fuera de rango: $v" }
  "$c".PadLeft(8, '0')
}
function Limpiar($t, $max) {
  # La impresora es de 8 bits: los acentos y la ñ se transliteran para que no
  # salgan como basura en el papel.
  $s = "$t"
  $s = $s -replace '[áàäâ]','a' -replace '[ÁÀÄÂ]','A' `
          -replace '[éèëê]','e' -replace '[ÉÈËÊ]','E' `
          -replace '[íìïî]','i' -replace '[ÍÌÏÎ]','I' `
          -replace '[óòöô]','o' -replace '[ÓÒÖÔ]','O' `
          -replace '[úùüû]','u' -replace '[ÚÙÜÛ]','U' `
          -replace 'ñ','n' -replace 'Ñ','N'
  $s = ($s -replace '[^\x20-\x7E]', ' ').Trim()
  if ($max -gt 0 -and $s.Length -gt $max) { $s = $s.Substring(0, $max) }
  $s
}

$cmds = New-Object System.Collections.Generic.List[string]
try {
  # 1) Cliente. La impresora exige RIF y razón social para una factura con
  #    datos; sin ellos saldría como consumidor final.
  if ($venta.cliente -and $venta.cliente.rif)    { $cmds.Add("iR*" + (Limpiar $venta.cliente.rif 20)) }
  if ($venta.cliente -and $venta.cliente.nombre) { $cmds.Add("iS*" + (Limpiar $venta.cliente.nombre 40)) }

  # 2) Referencia interna de QuickTap, para poder cruzar el papel con la venta.
  if ($venta.id_venta) { $cmds.Add("@Ref: " + (Limpiar $venta.id_venta 30)) }

  # 3) Productos.
  foreach ($it in $venta.items) {
    $clave = "$($it.tasa)".ToLower()
    if (-not $TASAS.ContainsKey($clave)) { throw "Tasa desconocida: '$($it.tasa)'" }
    $desc = Limpiar $it.descripcion 40
    if (-not $desc) { throw 'Un producto no tiene descripción.' }
    $cmds.Add($TASAS[$clave] + (Fmt-Precio $it.precio) + (Fmt-Cantidad $it.cantidad) + $desc)
  }

  # 4) Pago. Se soporta UN medio por factura (`1NN` paga el total): es lo que
  #    cubre el caso real del local y evita el pago fraccionado, cuyo formato de
  #    monto no está confirmado en la implementación de referencia.
  $medio = 'efectivo'
  if ($venta.pagos -and @($venta.pagos).Count -gt 0) {
    if (@($venta.pagos).Count -gt 1) { throw 'Por ahora solo se admite un medio de pago por factura.' }
    $medio = "$(@($venta.pagos)[0].medio)".ToLower()
  }
  if (-not $medios.ContainsKey($medio)) { throw "Medio de pago desconocido: '$medio'" }
  $cmds.Add("1" + $medios[$medio])

  # 5) Cierre. Requiere el Flag 50 en 01 (si no, la impresora rechaza el 199).
  $cmds.Add("199")
} catch {
  Salir-Error $_.Exception.Message 'VENTA_INVALIDA'
}

if ($SoloSimular) {
  Salir-Json @{ ok = $true; simulado = $true; comandos = $cmds }
}

# --- Emisión ----------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Dll)) { $Dll = Join-Path $PSScriptRoot 'TfhkaNet.dll' }
try { Unblock-File -Path $Dll -ErrorAction SilentlyContinue } catch { }
try { Add-Type -Path $Dll } catch {
  $c = if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message }
  Salir-Error "No se pudo cargar TfhkaNet.dll: $c" 'DLL_NO_CARGA'
}

$fp = New-Object TfhkaNet.IF.VE.Tfhka
$abierto = $false
$enviados = New-Object System.Collections.Generic.List[string]
$documentoAbierto = $false

try {
  if (-not $fp.OpenFpCtrl($Puerto)) { Salir-Error "No se pudo abrir $Puerto." 'PUERTO_NO_ABRE' }
  $abierto = $true
  if (-not $fp.CheckFPrinter()) { Salir-Error "En $Puerto no responde la impresora fiscal." 'SIN_RESPUESTA' }

  # Antes de empezar: si la impresora ya viene con un error (sin papel, tapa
  # abierta), es mejor no abrir el documento — quedaría a medias.
  if ($fp.ReadFpStatus()) {
    $st = $fp.GetPrinterStatus()
    if ($st.ErrorValidity -and "$($st.PrinterErrorCode)" -ne '0') {
      Salir-Error "La impresora reporta un error antes de empezar: $($st.PrinterErrorCode) - $($st.PrinterErrorDescription)" 'ERROR_PREVIO'
    }
  }

  foreach ($c in $cmds) {
    if (-not $fp.SendCmd($c)) {
      throw "La impresora rechazó el comando: '$c'"
    }
    $enviados.Add($c)
    # A partir del primer renglón enviado hay un documento abierto que, si algo
    # se cae, hay que anular sí o sí.
    $documentoAbierto = $true
    if ($c -eq '199') { $documentoAbierto = $false }   # ya cerró bien
  }

  # Número de factura y serial, para guardarlos junto a la venta.
  $s1 = $fp.GetS1PrinterData()
  Salir-Json @{
    ok             = $true
    puerto         = $Puerto
    numeroFactura  = "$($s1.LastInvoiceNumber)"
    serialMaquina  = "$($s1.RegisteredMachineNumber)"
    rifEmisor      = "$($s1.RIF)"
    fechaHora      = "$($s1.CurrentPrinterDateTime)"
    comandos       = $cmds
  }
} catch {
  $motivo = $_.Exception.Message
  $anulada = $false
  $detalleAnulacion = $null

  # Documento a medias: se anula para no dejar la impresora trabada. `7` es el
  # mismo comando que usa el Fiscalizador oficial en su botón de anulación.
  if ($documentoAbierto -and $abierto) {
    try {
      $anulada = [bool]$fp.SendCmd('7')
      if (-not $anulada) { $detalleAnulacion = 'La impresora no aceptó el comando de anulación.' }
    } catch {
      $detalleAnulacion = $_.Exception.Message
    }
  }

  $estado = $null
  try {
    if ($fp.ReadFpStatus()) {
      $ps = $fp.GetPrinterStatus()
      $estado = @{
        statusCode = "$($ps.PrinterStatusCode)"; statusDesc = "$($ps.PrinterStatusDescription)"
        errorCode  = "$($ps.PrinterErrorCode)";  errorDesc  = "$($ps.PrinterErrorDescription)"
      }
    }
  } catch { }

  Salir-Error $motivo 'FALLO_EMISION' @{
    documentoAnulado = $anulada
    detalleAnulacion = $detalleAnulacion
    comandosEnviados = $enviados
    estado           = $estado
  }
} finally {
  if ($abierto) { try { $fp.CloseFpCtrl() } catch { } }
}

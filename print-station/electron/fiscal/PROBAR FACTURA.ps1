# =============================================================================
#  Prueba de emisión de factura fiscal
# =============================================================================
#  Arranca SIEMPRE en modo simulación: arma la secuencia de comandos y la
#  muestra, sin mandarle nada a la impresora. Emitir de verdad exige confirmar
#  escribiendo EMITIR — una factura fiscal queda grabada de forma permanente en
#  la memoria fiscal y no se puede borrar, solo corregir con nota de crédito.
#
#  Se lanza con "PROBAR FACTURA.bat".
# =============================================================================

param(
  [string]$Puerto = 'COM3',
  # Alcanza para ver la secuencia; el modo real se pide dentro del script.
  [switch]$Emitir
)

$ErrorActionPreference = 'Continue'
$ps32 = Join-Path $env:SystemRoot 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $ps32)) { $ps32 = 'powershell.exe' }

Write-Host ''
Write-Host '=== PRUEBA DE FACTURA FISCAL ===' -ForegroundColor Cyan
Write-Host ''

# --- Venta de ejemplo -------------------------------------------------------
# Un solo producto barato, pagado en efectivo: si termina emitiéndose de
# verdad, que sea el documento más chico posible.
$venta = @{
  tipo     = 'fiscal'
  id_venta = 'PRUEBA-001'
  cliente  = @{ rif = 'V-12345678'; nombre = 'CONSUMIDOR FINAL' }
  items    = @(
    @{ descripcion = 'Producto de prueba'; precio = 1.00; cantidad = 1.000; tasa = 'general' }
  )
  pagos    = @( @{ medio = 'efectivo'; monto = 1.16 } )
}

$tmp = Join-Path $env:TEMP 'qt_factura_prueba.json'
$venta | ConvertTo-Json -Depth 6 | Set-Content -Path $tmp -Encoding UTF8

Write-Host 'Venta de prueba:' -ForegroundColor Yellow
Write-Host '  Cliente : CONSUMIDOR FINAL (V-12345678)'
Write-Host '  Producto: Producto de prueba — 1.00 x 1 (tasa general)'
Write-Host '  Pago    : efectivo'
Write-Host ''

# --- Paso 1: simular --------------------------------------------------------
Write-Host '--- Secuencia que se enviaria (SIN imprimir) ---' -ForegroundColor Cyan
$psArgs = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
          '-File', (Join-Path $PSScriptRoot 'factura.ps1'),
          '-Puerto', $Puerto, '-JsonPath', $tmp, '-SoloSimular')
$salida = & $ps32 @psArgs
try { $r = $salida | ConvertFrom-Json } catch {
  Write-Host "Respuesta ilegible: $salida" -ForegroundColor Red
  Read-Host "`nEnter para salir"; exit 1
}
if (-not $r.ok) {
  Write-Host "No se pudo armar la factura: $($r.error)" -ForegroundColor Red
  Read-Host "`nEnter para salir"; exit 1
}
foreach ($c in $r.comandos) { Write-Host "   $c" -ForegroundColor Gray }

Write-Host ''
Write-Host 'Lectura de la secuencia:' -ForegroundColor Yellow
Write-Host '  iR* / iS*  = RIF y nombre del cliente'
Write-Host '  @Ref:      = referencia interna de QuickTap (comentario)'
Write-Host '  !....      = producto (tasa general, precio, cantidad, descripcion)'
Write-Host '  101        = pagar el total en efectivo'
Write-Host '  199        = cerrar la factura'
Write-Host ''

# --- Paso 2: emitir de verdad (con confirmación) ----------------------------
Write-Host '======================= ATENCION =======================' -ForegroundColor Red
Write-Host ' Emitir imprime una FACTURA FISCAL REAL.' -ForegroundColor Red
Write-Host ' Queda grabada en la memoria fiscal de forma permanente' -ForegroundColor Red
Write-Host ' y NO se puede borrar: solo corregir con nota de credito.' -ForegroundColor Red
Write-Host '=======================================================' -ForegroundColor Red
Write-Host ''
Write-Host 'Escribe EMITIR (en mayusculas) para imprimirla de verdad.'
Write-Host 'Cualquier otra cosa cancela y no se imprime nada.'
$conf = Read-Host 'Confirmacion'

if ($conf -cne 'EMITIR') {
  Write-Host ''
  Write-Host 'Cancelado. No se imprimio nada.' -ForegroundColor Green
  Read-Host "`nEnter para salir"; exit 0
}

Write-Host ''
Write-Host 'Emitiendo...' -ForegroundColor Yellow
$psArgs2 = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
           '-File', (Join-Path $PSScriptRoot 'factura.ps1'),
           '-Puerto', $Puerto, '-JsonPath', $tmp)
$salida2 = & $ps32 @psArgs2
try { $r2 = $salida2 | ConvertFrom-Json } catch {
  Write-Host "Respuesta ilegible: $salida2" -ForegroundColor Red
  Read-Host "`nEnter para salir"; exit 1
}

Write-Host ''
if ($r2.ok) {
  Write-Host 'FACTURA EMITIDA' -ForegroundColor Green
  Write-Host ("  Numero de factura : {0}" -f $r2.numeroFactura)
  Write-Host ("  Serial de maquina : {0}" -f $r2.serialMaquina)
  Write-Host ("  RIF emisor        : {0}" -f $r2.rifEmisor)
  Write-Host ("  Fecha/hora        : {0}" -f $r2.fechaHora)
} else {
  Write-Host "FALLO: $($r2.error)" -ForegroundColor Red
  Write-Host ("  Codigo: {0}" -f $r2.codigo)
  if ($null -ne $r2.documentoAnulado) {
    if ($r2.documentoAnulado) {
      Write-Host '  El documento a medias SI se anulo (la impresora quedo libre).' -ForegroundColor Yellow
    } else {
      Write-Host '  ATENCION: no se pudo anular el documento a medias.' -ForegroundColor Red
      Write-Host '  Puede haber quedado una factura abierta en la impresora.' -ForegroundColor Red
      if ($r2.detalleAnulacion) { Write-Host ("  Detalle: {0}" -f $r2.detalleAnulacion) }
    }
  }
  if ($r2.estado) {
    Write-Host ("  Estado : {0} - {1}" -f $r2.estado.statusCode, $r2.estado.statusDesc)
    Write-Host ("  Error  : {0} - {1}" -f $r2.estado.errorCode, $r2.estado.errorDesc)
  }
  if ($r2.comandosEnviados) {
    Write-Host '  Comandos que alcanzaron a enviarse:'
    foreach ($c in $r2.comandosEnviados) { Write-Host "     $c" -ForegroundColor Gray }
  }
}

Write-Host ''
Write-Host 'Mandale esta pantalla a QuickTap.' -ForegroundColor Yellow
Read-Host "`nEnter para salir"

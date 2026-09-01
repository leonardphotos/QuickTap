# =============================================================================
#  Prueba de la impresora fiscal — para correr a mano en la PC del local
# =============================================================================
#  No hace falta reinstalar la Estación de Impresión para usar esto: basta con
#  esta carpeta (este script + fiscal.ps1 + TfhkaNet.dll) copiada en cualquier
#  lado. Sirve para confirmar que la impresora responde antes de integrarla.
#
#  Cómo se usa — clic derecho sobre el archivo > "Ejecutar con PowerShell", o
#  desde una consola:
#
#      .\probar-fiscal.ps1              # busca la impresora en todos los puertos
#      .\probar-fiscal.ps1 -Puerto COM4 # prueba solo ese puerto
#
#  Si Windows se queja de que los scripts están bloqueados:
#      powershell -ExecutionPolicy Bypass -File .\probar-fiscal.ps1
# =============================================================================

param(
  [string]$Puerto = '',
  [int]$TimeoutSegundos = 6
)

$ErrorActionPreference = 'Continue'
$fiscalPs1 = Join-Path $PSScriptRoot 'fiscal.ps1'
$dll = Join-Path $PSScriptRoot 'TfhkaNet.dll'

Write-Host ''
Write-Host '=== Prueba de impresora fiscal (The Factory HKA) ===' -ForegroundColor Cyan
Write-Host ''

# --- Comprobaciones previas -------------------------------------------------
if (-not (Test-Path $dll)) {
  Write-Host "FALTA TfhkaNet.dll en esta carpeta ($PSScriptRoot)." -ForegroundColor Red
  Write-Host 'Copia el archivo junto a este script y vuelve a intentar.'
  Read-Host "`nEnter para salir"; exit 1
}
if (-not (Test-Path $fiscalPs1)) {
  Write-Host "FALTA fiscal.ps1 en esta carpeta ($PSScriptRoot)." -ForegroundColor Red
  Read-Host "`nEnter para salir"; exit 1
}

# La DLL es de 32 bits: si esta consola es de 64, hay que relanzar el trabajo con
# el PowerShell de 32 (SysWOW64 es, contra toda intuición, el de 32 bits).
$ps32 = Join-Path $env:SystemRoot 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $ps32)) { $ps32 = 'powershell.exe' }
Write-Host ("PowerShell 32-bit : {0}" -f $ps32) -ForegroundColor DarkGray
Write-Host ("Driver            : {0}" -f $dll) -ForegroundColor DarkGray
Write-Host ''

# --- Qué puertos probar -----------------------------------------------------
if ($Puerto) {
  $puertos = @($Puerto)
  Write-Host "Probando solo $Puerto ..." -ForegroundColor Yellow
} else {
  $puertos = [System.IO.Ports.SerialPort]::GetPortNames() |
             Sort-Object { [int]($_ -replace '\D', '') } -Unique
  if (-not $puertos -or $puertos.Count -eq 0) {
    Write-Host 'Esta PC no tiene ningún puerto COM.' -ForegroundColor Red
    Write-Host 'Revisa que la impresora esté encendida y conectada por USB, y que'
    Write-Host 'Windows le haya instalado el driver (aparece en Administrador de'
    Write-Host 'dispositivos > Puertos (COM y LPT)).'
    Read-Host "`nEnter para salir"; exit 1
  }
  Write-Host ("Puertos detectados: {0}" -f ($puertos -join ', ')) -ForegroundColor Yellow
}
Write-Host ''

# --- Escaneo ----------------------------------------------------------------
$encontrada = $null
foreach ($p in $puertos) {
  Write-Host ("  {0,-6} ... " -f $p) -NoNewline
  $args = @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $fiscalPs1, '-Accion', 'status', '-Puerto', $p
  )
  $salida = ''
  try {
    $proc = Start-Process -FilePath $ps32 -ArgumentList $args -NoNewWindow -PassThru `
                          -RedirectStandardOutput "$env:TEMP\qt_fiscal_out.txt" `
                          -RedirectStandardError  "$env:TEMP\qt_fiscal_err.txt"
    if (-not $proc.WaitForExit($TimeoutSegundos * 1000)) {
      try { $proc.Kill() } catch { }
      Write-Host 'sin respuesta (timeout)' -ForegroundColor DarkGray
      continue
    }
    $salida = (Get-Content "$env:TEMP\qt_fiscal_out.txt" -Raw -ErrorAction SilentlyContinue)
  } catch {
    Write-Host ("error: {0}" -f $_.Exception.Message) -ForegroundColor DarkGray
    continue
  }

  if (-not $salida) { Write-Host 'sin respuesta' -ForegroundColor DarkGray; continue }
  try { $r = $salida | ConvertFrom-Json } catch {
    Write-Host 'respuesta ilegible' -ForegroundColor DarkGray; continue
  }

  if ($r.ok) {
    Write-Host 'IMPRESORA FISCAL ENCONTRADA' -ForegroundColor Green
    $encontrada = $r
    break
  }
  Write-Host ("{0}" -f $r.codigo) -ForegroundColor DarkGray
}

# --- Resultado --------------------------------------------------------------
Write-Host ''
if (-not $encontrada) {
  Write-Host 'No se encontró ninguna impresora fiscal.' -ForegroundColor Red
  Write-Host ''
  Write-Host 'Cosas que suelen ser:' -ForegroundColor Yellow
  Write-Host '  - La impresora está apagada, o sin papel (sin papel no acepta comandos).'
  Write-Host '  - El Fiscalizador de HKA está abierto y tiene el puerto tomado. Ciérralo.'
  Write-Host '  - El cable USB no está conectado, o Windows no le puso driver.'
  Read-Host "`nEnter para salir"; exit 1
}

Write-Host '=== Datos de la impresora ===' -ForegroundColor Cyan
Write-Host ("  Puerto          : {0}" -f $encontrada.puerto)
Write-Host ("  Modelo          : {0}" -f $(if ($encontrada.modelo) { $encontrada.modelo } else { '(no informado)' }))
Write-Host ("  Serial          : {0}" -f $encontrada.serial)
Write-Host ("  RIF grabado     : {0}" -f $encontrada.rif)
Write-Host ("  Última factura  : {0}" -f $encontrada.ultimaFactura)
Write-Host ("  Fecha/hora      : {0}" -f $encontrada.fechaHora)
Write-Host ("  Ventas del día  : {0}" -f $encontrada.ventasDelDia)

if ($encontrada.estado) {
  Write-Host ''
  Write-Host '=== Estado (S1) ===' -ForegroundColor Cyan
  Write-Host ("  Status : {0}  {1}" -f $encontrada.estado.statusCode, $encontrada.estado.statusDesc)
  $colorErr = if ($encontrada.estado.errorCode -eq '0') { 'Green' } else { 'Red' }
  Write-Host ("  Error  : {0}  {1}" -f $encontrada.estado.errorCode, $encontrada.estado.errorDesc) -ForegroundColor $colorErr
}

Write-Host ''
Write-Host 'Listo. Pásale estos datos a QuickTap para seguir con el paso 3.' -ForegroundColor Green
Read-Host "`nEnter para salir"

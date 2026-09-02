@echo off
REM ============================================================================
REM  Lanzador de la prueba de impresora fiscal.
REM ============================================================================
REM  Existe porque hacer doble clic (o "Ejecutar con PowerShell") sobre un .ps1
REM  descargado de internet no funciona: Windows lo bloquea por politica de
REM  scripts y cierra la ventana antes de que se alcance a leer el error, asi
REM  que desde afuera parece que "no hizo nada".
REM
REM  Este .bat lo lanza con la politica en Bypass y con el PowerShell de 32 bits
REM  (SysWOW64), que es el que puede cargar TfhkaNet.dll — la DLL esta marcada
REM  32BITREQUIRED y con el PowerShell de 64 bits falla al cargarla.
REM ============================================================================

setlocal
cd /d "%~dp0"

set "PS32=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS32%" set "PS32=powershell.exe"

REM Windows marca todo lo que viene de internet ("Mark of the Web") y .NET se
REM niega a cargar una DLL asi marcada: Add-Type falla y desde afuera parece que
REM la impresora no responde. Se desbloquea la carpeta entera antes de empezar.
"%PS32%" -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue"

"%PS32%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0probar-fiscal.ps1" %*

REM Red de seguridad: si el propio PowerShell no arranco, el script de adentro
REM nunca llega a su pausa final y la ventana se cerraria igual de rapido.
if errorlevel 1 (
  echo.
  echo No se pudo ejecutar PowerShell.
  pause
)
endlocal

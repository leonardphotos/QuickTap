@echo off
REM Lanzador de la prueba de factura fiscal. Arranca en modo simulacion:
REM muestra la secuencia sin imprimir, y solo emite si se confirma escribiendo
REM EMITIR. Ver la advertencia dentro del script.
setlocal
cd /d "%~dp0"
set "PS32=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS32%" set "PS32=powershell.exe"
"%PS32%" -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue"
"%PS32%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0PROBAR FACTURA.ps1" %*
if errorlevel 1 (
  echo.
  echo No se pudo ejecutar PowerShell.
  pause
)
endlocal

# Mini-servidor estático para la Estación de Impresión de QuickTap.
# Sirve los archivos de esta misma carpeta en http://localhost:5500
# No requiere Node ni Python: usa System.Net.HttpListener, incluido en Windows.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5500

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    # Ya hay algo escuchando en ese puerto (probablemente esta misma app ya
    # estaba corriendo) -> no hacemos nada más, dejamos que el navegador se
    # conecte al servidor existente.
    exit
}

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript"
    ".css"  = "text/css"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".json" = "application/json"
    ".svg"  = "image/svg+xml"
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        $safePath = $path.TrimStart("/").Replace("..", "")
        $filePath = Join-Path $root $safePath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath)
            $contentType = $mime[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
    } catch {
        $response.StatusCode = 500
    } finally {
        $response.OutputStream.Close()
    }
}

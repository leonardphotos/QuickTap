# Mini-servidor estático para la Estación de Impresión de QuickTap.
# Sirve los archivos de esta misma carpeta en http://localhost:5500
# No requiere Node ni Python: usa System.Net.HttpListener, incluido en Windows.
#
# También hace de puente para impresoras de red (Ethernet/WiFi, IP fija):
# el navegador no puede abrir sockets TCP crudos, así que index.html le
# manda los bytes ESC/POS en base64 a POST /print-raw, y este script los
# reenvía por un TcpClient normal a la IP:puerto de la impresora (9100,
# el puerto RAW estándar de las térmicas ESC/POS como las Xprinter).

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

function Write-JsonResponse($response, $statusCode, $obj) {
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json"
    $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
    $response.ContentLength64 = $jsonBytes.Length
    $response.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
}

# Manda bytes crudos (ESC/POS) por un socket TCP normal a la IP:puerto de una
# impresora de red. $client.Client.SendTimeout no aplica a Connect, por eso el
# timeout de conexión se hace con ConnectAsync + Wait manual.
function Send-RawToPrinter($ip, $port, [byte[]]$bytes) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        if (-not $client.ConnectAsync($ip, $port).Wait(4000)) {
            throw "No se pudo conectar a ${ip}:${port} (tiempo de espera agotado)."
        }
        $stream = $client.GetStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush()
    } finally {
        $client.Close()
    }
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
        $path = $request.Url.LocalPath

        if ($request.HttpMethod -eq "POST" -and $path -eq "/print-raw") {
            try {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd() | ConvertFrom-Json
                $reader.Close()

                if (-not $body.ip -or -not $body.port -or -not $body.data) {
                    throw "Faltan datos: se necesita ip, port y data."
                }
                $bytes = [System.Convert]::FromBase64String($body.data)
                Send-RawToPrinter -ip $body.ip -port ([int]$body.port) -bytes $bytes
                Write-JsonResponse $response 200 @{ ok = $true }
            } catch {
                Write-JsonResponse $response 500 @{ ok = $false; error = $_.Exception.Message }
            }
        } else {
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
        }
    } catch {
        $response.StatusCode = 500
    } finally {
        $response.OutputStream.Close()
    }
}

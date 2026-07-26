# QuickTap AI Photo Service

Microservicio local en el VPS que recibe una foto de producto, le mejora
levemente el contraste, le quita el fondo con `rembg` (IA open-source,
corre 100% local -- no llama a ninguna API externa) y la devuelve como
foto-producto profesional: fondo blanco puro + sombra suave, en JPG
optimizado.

No usa GPU, no depende de torch (rembg usa `onnxruntime` en CPU), y es
independiente del backend de Node -- corre en su propio proceso/puerto.

## 1. Preparar el servidor (por SSH, una sola vez)

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip build-essential libjpeg-dev zlib1g-dev
```

`libjpeg-dev`/`zlib1g-dev` son para que Pillow compile rápido sus wheels de
imagen (en la mayoría de los casos pip ya trae wheels precompilados y ni
los usa, pero conviene tenerlos por si acaso).

## 2. Crear el entorno virtual y el proyecto

```bash
mkdir -p ~/ai-photo-service
cd ~/ai-photo-service
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
```

## 3. Instalar las dependencias exactas

```bash
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0" python-multipart==0.0.20 pillow==11.1.0 rembg==2.0.61
```

(o, si ya subiste `requirements.txt` a `~/ai-photo-service/`: `pip install -r requirements.txt`)

## 4. Subir `main.py`

Copia el archivo `main.py` de esta carpeta a `~/ai-photo-service/main.py`
en el VPS (por `scp`, `rsync`, o pegándolo directo con `nano`/`vim`).

```bash
scp ai-photo-service/main.py ai-photo-service/requirements.txt tu_usuario@tu_vps:~/ai-photo-service/
```

## 5. Probar en primer plano antes de ponerlo en systemd

```bash
cd ~/ai-photo-service
source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8100
```

La **primera vez que proceses una imagen**, `rembg` descarga su modelo
(`u2net`, ~176MB) a `~/.u2net/` -- va a tardar un poco esa primera llamada
y necesita conexión a internet saliente desde el VPS. Las siguientes
llamadas son instantáneas porque el modelo queda cacheado en disco.

Probar desde otra terminal (en el propio VPS, ya que quedó en `127.0.0.1`,
no expuesto a internet):

```bash
curl -X POST http://127.0.0.1:8100/process-image -F "file=@/ruta/a/una/foto.jpg" -o resultado.jpg
```

Si `resultado.jpg` abre y se ve con fondo blanco + sombra, funciona. `Ctrl+C`
para bajarlo y pasar al paso 6.

**Nota de recursos:** `rembg` + `onnxruntime` en CPU usan bastante RAM
durante el procesamiento (pico de ~300-500MB por request). Si el VPS ya
está ajustado en memoria (corriendo Postgres + Node + Nginx), corrobora
con `free -h` que hay margen antes de meterlo en producción -- si anda
justo, conviene poner un límite de memoria en el `systemd` (ver abajo,
`MemoryMax`) para que si se pasa, se reinicie solo en vez de tumbar el
resto del servidor.

## 6. Dejarlo corriendo permanentemente con systemd (recomendado sobre PM2)

Systemd es la opción más simple aquí: no hace falta Node instalado para
correrlo (a diferencia de PM2), y ya viene con Ubuntu/Debian. Crea el
archivo de unidad:

```bash
sudo nano /etc/systemd/system/quicktap-ai-photo.service
```

Contenido:

```ini
[Unit]
Description=QuickTap AI Photo Service (rembg)
After=network.target

[Service]
Type=simple
User=TU_USUARIO
WorkingDirectory=/home/TU_USUARIO/ai-photo-service
ExecStart=/home/TU_USUARIO/ai-photo-service/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8100
Restart=always
RestartSec=5
MemoryMax=768M

[Install]
WantedBy=multi-user.target
```

Reemplaza `TU_USUARIO` por el usuario real del VPS (no uses `root`).
`--host 127.0.0.1` es intencional: el servicio queda **solo accesible
desde el propio VPS**, no expuesto a internet. El backend de Node le
pega internamente (`http://127.0.0.1:8100/process-image`) y listo -- no
hace falta abrir puerto en el firewall ni agregarlo a Nginx, a menos que
quieras llamarlo directo desde el navegador del panel (en ese caso, sí
habría que proxyearlo por Nginx bajo un path tipo `/ai-photo/` con su
propio `location` block, igual que ya hace con `/api/`).

Activarlo:

```bash
sudo systemctl daemon-reload
sudo systemctl enable quicktap-ai-photo
sudo systemctl start quicktap-ai-photo
sudo systemctl status quicktap-ai-photo
```

Ver logs en vivo:

```bash
sudo journalctl -u quicktap-ai-photo -f
```

Reiniciarlo tras cambios en `main.py`:

```bash
sudo systemctl restart quicktap-ai-photo
```

## 7. Integrarlo con el backend de QuickTap (opcional, siguiente paso)

Una vez confirmado que el servicio responde, el backend de Node puede
llamarlo desde el mismo endpoint de subida de fotos (`inventory.controller.ts` /
`product.controller.ts`) con un `fetch`/`axios` a
`http://127.0.0.1:8100/process-image` antes de guardar el archivo final
en `uploads/`, en vez de (o además de) `optimizeImage()` (sharp). Esto no
está implementado todavía -- es un cambio de código en el repo, aparte de
este microservicio, y conviene decidir primero si quieres que sea
automático en cada subida o un botón opcional ("Mejorar foto con IA") en
el formulario.

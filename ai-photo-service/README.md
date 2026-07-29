# QuickTap AI Photo Service

Microservicio local en el VPS que recibe una foto de producto y usa
**Gemini** (`gemini-2.5-flash-image`) para convertirla en una foto-producto
profesional de catálogo: el botón "Mejorar foto" decora/ajusta el fondo y
la escena, y el botón "Fondo blanco" la recompone sobre fondo blanco de
estudio con reflejo, estilo foto de catálogo de marca.

A diferencia de una implementación 100% local, esto llama a la API de
Gemini: necesita conexión a internet saliente desde el VPS y una
`GEMINI_API_KEY` (con cuota/billing habilitado en Google AI Studio /
Google Cloud). Sigue corriendo como su propio proceso/puerto,
independiente del backend de Node.

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
pip install fastapi==0.115.6 "uvicorn[standard]==0.34.0" python-multipart==0.0.20 pillow==11.1.0 google-genai==1.2.0
```

(o, si ya subiste `requirements.txt` a `~/ai-photo-service/`: `pip install -r requirements.txt`)

## 4. Subir `main.py` y obtener la API key de Gemini

Copia el archivo `main.py` de esta carpeta a `~/ai-photo-service/main.py`
en el VPS (por `scp`, `rsync`, o pegándolo directo con `nano`/`vim`).

```bash
scp ai-photo-service/main.py ai-photo-service/requirements.txt tu_usuario@tu_vps:~/ai-photo-service/
```

Genera una API key en [Google AI Studio](https://aistudio.google.com/apikey)
y expórtala como variable de entorno antes de levantar el servicio (ver
paso 5 y la sección de systemd en el paso 6):

```bash
export GEMINI_API_KEY="tu-api-key-aqui"
```

## 5. Probar en primer plano antes de ponerlo en systemd

```bash
cd ~/ai-photo-service
source venv/bin/activate
export GEMINI_API_KEY="tu-api-key-aqui"
uvicorn main:app --host 127.0.0.1 --port 8100
```

El servicio expone dos endpoints (uno por cada botón del panel de admin):

- `POST /enhance-image` -- "Mejorar foto con IA": decora/ajusta el fondo y la escena para que luzca como foto de producto profesional.
- `POST /white-background` -- "Fondo blanco con IA": quita el fondo y compone sobre blanco de estudio con reflejo, estilo foto de catálogo.

Probar desde otra terminal (en el propio VPS, ya que quedó en `127.0.0.1`,
no expuesto a internet):

```bash
curl -X POST http://127.0.0.1:8100/enhance-image -F "file=@/ruta/a/una/foto.jpg" -o mejorada.jpg
curl -X POST http://127.0.0.1:8100/white-background -F "file=@/ruta/a/una/foto.jpg" -o fondo-blanco.jpg
```

Si ambos archivos abren correctamente, funciona. `Ctrl+C` para bajarlo y
pasar al paso 6.

**Nota de costo:** cada llamada a `gemini-2.5-flash-image` consume cuota
de la API (revisa el pricing vigente en Google AI Studio antes de
habilitarlo en producción). A diferencia de la versión anterior con
`rembg`, esto ya no es gratis ni ilimitado.

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
Description=QuickTap AI Photo Service (Gemini)
After=network.target

[Service]
Type=simple
User=TU_USUARIO
WorkingDirectory=/home/TU_USUARIO/ai-photo-service
Environment=GEMINI_API_KEY=tu-api-key-aqui
ExecStart=/home/TU_USUARIO/ai-photo-service/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8100
Restart=always
RestartSec=5
MemoryMax=768M

[Install]
WantedBy=multi-user.target
```

Reemplaza `TU_USUARIO` por el usuario real del VPS (no uses `root`) y
`tu-api-key-aqui` por la API key real -- no la subas al repo. `--host
127.0.0.1` es intencional: el servicio queda **solo accesible desde el
propio VPS**, no expuesto a internet. El backend de Node le pega
internamente (`http://127.0.0.1:8100/enhance-image` y
`http://127.0.0.1:8100/white-background`, ver sección 7) y listo -- no
hace falta abrir puerto en el firewall ni agregarlo a Nginx.

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

Reiniciarlo tras cambios en `main.py` o en la API key:

```bash
sudo systemctl restart quicktap-ai-photo
```

## 7. Integración con el backend de QuickTap (ya implementada)

El backend de Node expone dos endpoints propios que actúan de proxy hacia
este microservicio (ver `src/modules/ai-photo/`):

- `POST /api/v1/ai-photo/enhance`
- `POST /api/v1/ai-photo/white-background`

Ambos reciben el campo `photo` (multipart/form-data, igual que
`/products/upload-photo`), reenvían el archivo a este microservicio,
guardan la imagen procesada en `uploads/ai-photo/` y devuelven
`{ data: { url } }` -- el mismo shape que ya usa `PhotoUploadField` en el
frontend. El formulario de Productos de Restaurantes y el de Locales
(Shop) tienen los dos botones ("Mejorar foto con IA" / "Fondo blanco con
IA") conectados a estos endpoints.

Para que el backend encuentre este servicio, define en el `.env` del
backend (raíz del repo, no en `web/`):

```bash
AI_PHOTO_SERVICE_URL=http://127.0.0.1:8100
```

(La `GEMINI_API_KEY` vive únicamente en el `.env`/systemd de este
microservicio Python, no en el backend de Node -- el backend nunca habla
con Gemini directamente.)

Si la variable no está definida, o el microservicio no responde (no está
instalado, no tiene `GEMINI_API_KEY` configurada, o systemd lo tiene
caído), el backend devuelve un error claro ("Servicio de IA no
disponible") en vez de romper la subida de fotos normal -- los dos
botones de IA son un extra, la subida manual de fotos sigue funcionando
igual sin este servicio.

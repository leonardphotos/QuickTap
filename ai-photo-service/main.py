"""
QuickTap AI Photo Service
Microservicio local en el VPS que recibe una foto de producto y usa Gemini
(gemini-2.5-flash-image) para convertirla en una foto-producto profesional
de catálogo -- ya sea mejorando/decorando el fondo original, o
reemplazándolo por un fondo blanco de estudio.

No forma parte del backend principal de QuickTap ni comparte proceso con
él -- corre como su propio servicio (ver systemd al final de README.md).
A diferencia de la versión anterior (Pillow + rembg, 100% local), esta
versión llama a la API de Gemini: necesita `GEMINI_API_KEY` y conexión a
internet saliente desde el VPS.
"""

import io
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from google import genai
from google.genai import types
from PIL import Image, ImageOps

app = FastAPI(title="QuickTap AI Photo Service")

GEMINI_MODEL = "gemini-2.5-flash-image"
JPEG_QUALITY = 90
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB

# Prompts fijos por botón -- la instrucción "manteniendo/sin cambiar el
# producto" es la parte crítica en ambos: sin ella, el modelo tiende a
# regenerar detalles del producto en vez de solo ajustar la escena.
ENHANCE_PROMPT = (
    "Mejora esta fotografía de producto para que aparezca con un fondo adecuado "
    "dependiendo del producto: decora, cambia el fondo y añade elementos para que "
    "la fotografía de producto sea lo más perfecta posible, manteniendo las "
    "dimensiones, el tamaño y la estética del producto original. No alteres la "
    "forma, el color, el texto ni ningún detalle real del producto."
)

WHITE_BACKGROUND_PROMPT = (
    "Elimina el fondo de esta fotografía de producto y colócalo sobre fondo "
    "blanco con un ligero reflejo, para que sea lo más similar a una fotografía "
    "profesional con luces de estudio. El resultado debe verse como una "
    "fotografía de catálogo de marca. Mejora o corrige la posición del producto "
    "para que sea lo más cercano a una fotografía de catálogo profesional. No "
    "alteres la forma, el color, el texto ni ningún detalle real del producto."
)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(503, "GEMINI_API_KEY no está configurada en el servicio de IA.")
        _client = genai.Client(api_key=api_key)
    return _client


def _read_upload(raw: bytes) -> Image.Image:
    try:
        source = Image.open(io.BytesIO(raw))
        source = ImageOps.exif_transpose(source)  # respeta la orientación de la cámara
        return source.convert("RGB")
    except Exception:
        raise HTTPException(400, "No se pudo leer la imagen.")


def _validate_upload(file: UploadFile, raw: bytes) -> None:
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Formato no soportado. Usa JPG, PNG o WEBP.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "La imagen supera el límite de 15MB.")


def _run_gemini(image: Image.Image, prompt: str) -> bytes:
    """Envía la imagen + el prompt a Gemini y devuelve los bytes de la
    imagen resultante (PNG/JPEG, según lo que entregue el modelo)."""
    client = _get_client()

    buf = io.BytesIO()
    image.save(buf, format="PNG")

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png"),
                prompt,
            ],
        )
    except Exception as exc:
        raise HTTPException(502, f"Gemini no pudo procesar la imagen: {exc}")

    candidates = response.candidates or []
    for candidate in candidates:
        for part in candidate.content.parts or []:
            if part.inline_data is not None and part.inline_data.data:
                return part.inline_data.data

    raise HTTPException(502, "Gemini no devolvió ninguna imagen. Intenta con otra foto.")


def _to_jpeg(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


@app.get("/health")
def health():
    return {"status": "ok", "gemini_configured": bool(os.environ.get("GEMINI_API_KEY"))}


@app.post("/enhance-image")
async def enhance_image(file: UploadFile = File(...)):
    """Botón "Mejorar foto con IA": decora/ajusta el fondo y la escena para
    que la foto luzca como una foto de producto profesional."""
    raw = await file.read()
    _validate_upload(file, raw)
    source = _read_upload(raw)
    result = _run_gemini(source, ENHANCE_PROMPT)
    return Response(content=_to_jpeg(result), media_type="image/jpeg")


@app.post("/white-background")
async def white_background(file: UploadFile = File(...)):
    """Botón "Fondo blanco con IA": quita el fondo original y compone el
    producto sobre blanco de estudio, estilo foto de catálogo."""
    raw = await file.read()
    _validate_upload(file, raw)
    source = _read_upload(raw)
    result = _run_gemini(source, WHITE_BACKGROUND_PROMPT)
    return Response(content=_to_jpeg(result), media_type="image/jpeg")

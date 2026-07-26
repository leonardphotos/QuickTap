"""
QuickTap AI Photo Service
Microservicio local (FastAPI + rembg) para convertir una foto de producto
"casera" en una foto-producto profesional: quita el fondo, la coloca sobre
blanco puro (#FFFFFF) con una sombra suave, y devuelve un JPG optimizado.

No forma parte del backend principal de QuickTap ni comparte proceso con
él -- corre como su propio servicio (ver systemd al final de este archivo
en forma de comentario, y las instrucciones de despliegue en README.md).
"""

import io

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from rembg import remove

app = FastAPI(title="QuickTap AI Photo Service")

# Lienzo final (cuadrado, suficiente para el menú y para zoom en la ficha
# de producto sin perder nitidez).
CANVAS_SIZE = 1200
# Margen entre el producto recortado y el borde del lienzo.
PADDING_RATIO = 0.08
CONTRAST_FACTOR = 1.12
JPEG_QUALITY = 85

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB


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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/enhance-image")
async def enhance_image(file: UploadFile = File(...)):
    """Botón "Mejorar foto con IA": ajusta contraste, brillo y nitidez sin
    tocar el fondo -- para fotos que ya están bien encuadradas pero se ven
    apagadas o borrosas (foto tomada con el celular en la cocina, etc.)."""
    raw = await file.read()
    _validate_upload(file, raw)
    source = _read_upload(raw)

    result = ImageEnhance.Contrast(source).enhance(1.15)
    result = ImageEnhance.Brightness(result).enhance(1.04)
    result = ImageEnhance.Color(result).enhance(1.08)
    result = ImageEnhance.Sharpness(result).enhance(1.3)

    out = io.BytesIO()
    result.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    out.seek(0)
    return Response(content=out.getvalue(), media_type="image/jpeg")


@app.post("/white-background")
async def white_background(file: UploadFile = File(...)):
    """Botón "Fondo blanco con IA": quita el fondo original y compone el
    producto sobre blanco puro con una sombra suave -- efecto foto-producto."""
    raw = await file.read()
    _validate_upload(file, raw)
    source = _read_upload(raw)

    # 1) Mejora leve de contraste ANTES de quitar el fondo -- ayuda a rembg
    #    a distinguir mejor los bordes del producto.
    enhanced = ImageEnhance.Contrast(source).enhance(CONTRAST_FACTOR)

    # 2) Quitar el fondo (rembg devuelve RGBA con el producto recortado).
    buf = io.BytesIO()
    enhanced.save(buf, format="PNG")
    try:
        cutout = remove(buf.getvalue())
    except Exception:
        raise HTTPException(500, "Falló la remoción de fondo.")
    cutout = Image.open(io.BytesIO(cutout)).convert("RGBA")

    # 3) Recortar al bounding box del producto (sin aire transparente de sobra).
    bbox = cutout.getbbox()
    if bbox:
        cutout = cutout.crop(bbox)

    # 4) Escalar el producto para que quepa en el lienzo dejando el margen.
    target = int(CANVAS_SIZE * (1 - PADDING_RATIO * 2))
    scale = min(target / cutout.width, target / cutout.height)
    new_size = (max(1, int(cutout.width * scale)), max(1, int(cutout.height * scale)))
    cutout = cutout.resize(new_size, Image.LANCZOS)

    # 5) Construir la sombra: la silueta del producto (canal alfa), difuminada,
    #    tintada de gris y desplazada un poco hacia abajo -- efecto foto-producto.
    shadow_alpha = cutout.split()[3].filter(ImageFilter.GaussianBlur(new_size[0] * 0.02 + 6))
    shadow_layer = Image.new("RGBA", cutout.size, (0, 0, 0, 0))
    shadow_layer.putalpha(shadow_alpha.point(lambda a: int(a * 0.35)))

    canvas = Image.new("RGB", (CANVAS_SIZE, CANVAS_SIZE), "#FFFFFF")
    paste_x = (CANVAS_SIZE - new_size[0]) // 2
    paste_y = (CANVAS_SIZE - new_size[1]) // 2

    shadow_offset_y = int(new_size[1] * 0.04) + 10
    shadow_squash = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    shadow_squash.paste(shadow_layer, (paste_x, paste_y + shadow_offset_y), shadow_layer)
    canvas.paste(shadow_squash, (0, 0), shadow_squash)

    # 6) Pegar el producto encima de la sombra.
    canvas.paste(cutout, (paste_x, paste_y), cutout)

    # 7) Exportar como JPG optimizado y liviano.
    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    out.seek(0)

    return Response(content=out.getvalue(), media_type="image/jpeg")

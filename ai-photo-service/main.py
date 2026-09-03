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
import json
import os

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from google import genai
from google.genai import types
from PIL import Image, ImageOps

app = FastAPI(title="QuickTap AI Photo Service")

# Modelos, configurables por variable de entorno.
#
# Van por env y no fijos en el código porque Google retira modelos sin avisar: los
# gemini-2.5-* que usaba este servicio dejaron de estar disponibles para cuentas nuevas
# (404 "no longer available to new users"), y cambiarlos no debería exigir un despliegue.
GEMINI_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
# Modelo de texto/visión: leer la foto y describir el plato es una tarea distinta
# a generar una imagen, y el modelo de imagen no devuelve JSON.
GEMINI_VISION_MODEL = os.environ.get("GEMINI_TEXT_MODEL", "gemini-3.6-flash")
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


# --- Análisis del plato: foto -> ingredientes -----------------------------
#
# Se pide JSON estricto con un esquema (response_schema) en vez de texto libre:
# el resultado entra directo a la receta del producto, y parsear prosa del modelo
# es donde esto se rompería en silencio.
#
# Las unidades se limitan a las tres que maneja el inventario de QuickTap
# (kg / lt / unidad) y la cantidad va SIEMPRE en esa unidad base, que es como la
# guarda RecipeIngredient. Se le pide explícitamente que estime por UNA porción.

ANALYZE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "plato": {"type": "STRING"},
        "descripcion": {"type": "STRING"},
        "ingredientes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "nombre": {"type": "STRING"},
                    "unidad": {"type": "STRING", "enum": ["kg", "lt", "unidad"]},
                    "cantidad": {"type": "NUMBER"},
                },
                "required": ["nombre", "unidad", "cantidad"],
            },
        },
    },
    "required": ["plato", "descripcion", "ingredientes"],
}

ANALYZE_PROMPT = (
    "Eres un chef de cocina profesional armando la ficha técnica de un plato para el "
    "sistema de inventario de un restaurante. Mira la fotografía y responde en español.\n\n"
    "1. `plato`: el nombre del plato tal como aparecería en la carta.\n"
    "2. `descripcion`: una línea corta y apetitosa para el menú, sin inventar ingredientes "
    "que no se vean.\n"
    "3. `ingredientes`: los insumos que hacen falta para prepararlo, con la cantidad "
    "estimada para UNA sola porción como la de la foto.\n\n"
    "Reglas para los ingredientes:\n"
    "- Nombra el INSUMO que se compra, no el plato ya preparado: 'Carne de res molida', "
    "no 'hamburguesa cocida'.\n"
    "- Usa nombres genéricos y en singular, como los pondría un almacén: 'Queso cheddar', "
    "'Pan para hamburguesa', 'Aceite vegetal'.\n"
    "- `unidad` solo puede ser: 'kg' para lo que se pesa, 'lt' para líquidos, 'unidad' para "
    "lo que se cuenta (panes, huevos, rebanadas).\n"
    "- `cantidad` va SIEMPRE expresada en esa unidad: 150 gramos se escribe 0.15 con unidad "
    "'kg'; 30 mililitros se escribe 0.03 con unidad 'lt'.\n"
    "- Incluye también lo que no se ve pero es evidente que lleva (sal, aceite de cocción, "
    "condimentos básicos) con cantidades pequeñas y realistas.\n"
    "- No inventes rellenos ni ingredientes de lujo que no estén a la vista.\n"
    "- Si en la foto hay varias porciones o un combo, estima para UNA porción individual.\n\n"
    "Son estimaciones de partida: el restaurante corregirá los pesos exactos después."
)


@app.post("/analizar-plato")
async def analizar_plato(file: UploadFile = File(...), nombre: str = Form("")):
    """Lee la foto de un plato y devuelve sus ingredientes estimados.

    Es la base de la carga asistida del panel maestro: con esto el catálogo de un
    cliente nuevo llega con receta e insumos ya propuestos, y el restaurante solo
    ajusta los pesos reales.
    """
    raw = await file.read()
    _validate_upload(file, raw)
    source = _read_upload(raw)
    client = _get_client()

    buf = io.BytesIO()
    source.save(buf, format="PNG")

    # El nombre que ya escribió el operador manda sobre lo que el modelo crea ver:
    # una foto puede ser ambigua, el nombre del plato casi nunca lo es.
    prompt = ANALYZE_PROMPT
    if nombre.strip():
        prompt += f"\n\nEl plato se llama \"{nombre.strip()}\". Respeta ese nombre en `plato`."

    try:
        response = client.models.generate_content(
            model=GEMINI_VISION_MODEL,
            contents=[
                types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png"),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ANALYZE_SCHEMA,
            ),
        )
    except Exception as exc:
        raise HTTPException(502, f"Gemini no pudo analizar la foto: {exc}")

    texto = (response.text or "").strip()
    if not texto:
        raise HTTPException(502, "Gemini no devolvió ningún análisis. Intenta con otra foto.")

    try:
        datos = json.loads(texto)
    except json.JSONDecodeError:
        raise HTTPException(502, "Gemini devolvió una respuesta que no se pudo leer.")

    # Red de seguridad sobre lo que devuelve el modelo: el esquema lo pide, pero
    # quien escribe en la base es Node y no puede confiar en que llegó completo.
    ingredientes = []
    for item in datos.get("ingredientes") or []:
        nombre_ing = str(item.get("nombre") or "").strip()
        unidad = item.get("unidad")
        try:
            cantidad = float(item.get("cantidad"))
        except (TypeError, ValueError):
            continue
        if not nombre_ing or unidad not in ("kg", "lt", "unidad") or cantidad <= 0:
            continue
        ingredientes.append({"nombre": nombre_ing[:120], "unidad": unidad, "cantidad": cantidad})

    return {
        "plato": str(datos.get("plato") or "").strip()[:120],
        "descripcion": str(datos.get("descripcion") or "").strip()[:500],
        "ingredientes": ingredientes,
    }


# ============================================================================
#  Carga masiva de catálogo (panel maestro)
# ============================================================================
#  Dos pasos, deliberadamente separados:
#
#    1. LEER LA CARTA  -> qué platos hay, a qué precio y en qué categoría.
#       Entra una foto del menú impreso o el texto de la hoja de cálculo que
#       mandó el cliente. Es pura transcripción: no se inventa nada.
#
#    2. FICHAS TÉCNICAS -> qué lleva cada plato.
#       Entra la lista de nombres del paso 1 y sale, por plato, sus insumos
#       directos y sus preparaciones (bases que se hacen aparte).
#
#  Van aparte porque son tareas distintas y fallan distinto: transcribir mal
#  un precio se ve al instante en la revisión; estimar mal unos gramos es una
#  aproximación que el restaurante corrige después. Mezclarlas en una sola
#  llamada haría que un error de lectura arrastrara toda la ficha.

CARTA_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "productos": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "nombre": {"type": "STRING"},
                    "categoria": {"type": "STRING"},
                    "precio": {"type": "NUMBER"},
                    "descripcion": {"type": "STRING"},
                },
                "required": ["nombre", "categoria", "precio"],
            },
        },
    },
    "required": ["productos"],
}

CARTA_PROMPT = (
    "Eres un asistente que transcribe la carta de un restaurante para cargarla en su sistema. "
    "Devuelve TODOS los platos que encuentres, en español.\n\n"
    "1. `nombre`: el nombre del plato tal cual está escrito.\n"
    "2. `categoria`: la sección de la carta donde aparece (Entradas, Hamburguesas, Bebidas...). "
    "Si la carta no las separa, deduce una categoría corta y sensata por el tipo de plato.\n"
    "3. `precio`: solo el número, sin símbolo de moneda ni separadores de miles. Si un plato no "
    "tiene precio visible, pon 0 — es preferible un cero evidente a un precio inventado.\n"
    "4. `descripcion`: la descripción que trae la carta. Si no trae, déjala vacía; NO la inventes.\n\n"
    "Reglas:\n"
    "- Esto es TRANSCRIPCIÓN, no creación: no agregues platos que no estén, no corrijas nombres, "
    "no completes precios que no se ven.\n"
    "- Si el mismo plato aparece con varios tamaños o precios (Pequeña/Mediana/Grande), devuelve "
    "una fila por cada tamaño y ponlo en el nombre: 'Pizza Margarita (Grande)'.\n"
    "- Ignora todo lo que no sea un plato vendible: horarios, direcciones, redes sociales, "
    "encabezados decorativos, notas al pie."
)

FICHAS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "platos": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "nombre": {"type": "STRING"},
                    "insumos": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "nombre": {"type": "STRING"},
                                "unidad": {"type": "STRING", "enum": ["kg", "lt", "unidad"]},
                                "cantidad": {"type": "NUMBER"},
                            },
                            "required": ["nombre", "unidad", "cantidad"],
                        },
                    },
                    "preparaciones": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "nombre": {"type": "STRING"},
                                "unidad": {"type": "STRING", "enum": ["kg", "lt", "unidad"]},
                                "rendimiento": {"type": "NUMBER"},
                                "cantidad": {"type": "NUMBER"},
                                "insumos": {
                                    "type": "ARRAY",
                                    "items": {
                                        "type": "OBJECT",
                                        "properties": {
                                            "nombre": {"type": "STRING"},
                                            "unidad": {"type": "STRING", "enum": ["kg", "lt", "unidad"]},
                                            "cantidad": {"type": "NUMBER"},
                                        },
                                        "required": ["nombre", "unidad", "cantidad"],
                                    },
                                },
                            },
                            "required": ["nombre", "unidad", "rendimiento", "cantidad", "insumos"],
                        },
                    },
                },
                "required": ["nombre", "insumos", "preparaciones"],
            },
        },
    },
    "required": ["platos"],
}

FICHAS_PROMPT = (
    "Eres un chef de cocina profesional armando las fichas técnicas de una carta para el sistema "
    "de inventario de un restaurante. Para CADA plato de la lista devuelve qué lleva, en español.\n\n"
    "Separa lo que lleva en dos cosas:\n\n"
    "`insumos`: lo que se compra y va directo al plato — el pan, la carne, el queso, el aceite.\n"
    "  - Nombra el insumo que se COMPRA, no el plato preparado: 'Carne de res molida', no "
    "'hamburguesa cocida'.\n"
    "  - Nombres genéricos y en singular, como los pondría un almacén: 'Queso cheddar', "
    "'Pan para hamburguesa', 'Aceite vegetal'.\n"
    "  - `unidad` solo puede ser 'kg' (lo que se pesa), 'lt' (líquidos) o 'unidad' (lo que se "
    "cuenta: panes, huevos, rebanadas).\n"
    "  - `cantidad` SIEMPRE en esa unidad y para UNA porción: 150 gramos es 0.15 en 'kg'; "
    "30 mililitros es 0.03 en 'lt'.\n\n"
    "`preparaciones`: SOLO las bases que en una cocina de verdad se preparan aparte, en tanda, y "
    "se reutilizan — salsas, masas, caldos, adobos, mezclas madre.\n"
    "  - `rendimiento` es cuánto rinde UNA tanda completa (ej. 2 lt de salsa) y `insumos` son los "
    "ingredientes de ESA tanda entera, no de una porción.\n"
    "  - `cantidad` es cuánto usa este plato de esa preparación, en la unidad de la preparación.\n"
    "  - Usa el MISMO nombre de preparación cuando varios platos comparten la base, para que no "
    "se dupliquen.\n\n"
    "Reglas importantes:\n"
    "- NO conviertas en preparación algo que se compra hecho ni algo que solo usa un plato y no "
    "se prepara en tanda. Una hamburguesa normal NO tiene preparaciones; una pasta con salsa "
    "boloñesa SÍ (la boloñesa).\n"
    "- Si dudas, ponlo como insumo directo. Es preferible una ficha simple y correcta que un "
    "inventario lleno de preparaciones que nadie prepara.\n"
    "- Incluye lo que no se nombra pero es evidente (sal, aceite de cocción, condimentos básicos) "
    "con cantidades pequeñas y realistas.\n"
    "- Devuelve un elemento por CADA plato de la lista, con el nombre EXACTO que te pasaron.\n\n"
    "Son estimaciones de partida: el restaurante corregirá los pesos exactos después."
)


def _pedir_json(contents, schema, que_falló: str) -> dict:
    """Llama a Gemini pidiendo JSON con esquema y devuelve el dict ya parseado."""
    client = _get_client()
    try:
        response = client.models.generate_content(
            model=GEMINI_VISION_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
    except Exception as exc:
        raise HTTPException(502, f"Gemini no pudo {que_falló}: {exc}")

    texto = (response.text or "").strip()
    if not texto:
        raise HTTPException(502, f"Gemini no devolvió nada al {que_falló}. Intenta de nuevo.")
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        raise HTTPException(502, "Gemini devolvió una respuesta que no se pudo leer.")


def _limpiar_insumos(crudos) -> list[dict]:
    """Red de seguridad sobre lo que devuelve el modelo: quien escribe en la base es Node
    y no puede confiar en que el esquema llegó respetado."""
    salida = []
    for item in crudos or []:
        nombre = str(item.get("nombre") or "").strip()
        unidad = item.get("unidad")
        try:
            cantidad = float(item.get("cantidad"))
        except (TypeError, ValueError):
            continue
        if not nombre or unidad not in ("kg", "lt", "unidad") or cantidad <= 0:
            continue
        salida.append({"nombre": nombre[:120], "unidad": unidad, "cantidad": cantidad})
    return salida



def _limpiar_fichas(crudas) -> list[dict]:
    """Red de seguridad sobre las fichas técnicas que devuelve el modelo. La comparten
    /fichas-tecnicas (fichas estimadas) y /leer-recetas (fichas transcritas del cliente):
    la salida es la misma, así que la limpieza tiene que ser una sola."""
    salida = []
    for item in crudas or []:
        nombre = str(item.get("nombre") or "").strip()
        if not nombre:
            continue
        preparaciones = []
        for prep in item.get("preparaciones") or []:
            prep_nombre = str(prep.get("nombre") or "").strip()
            unidad = prep.get("unidad")
            try:
                rendimiento = float(prep.get("rendimiento"))
                cantidad = float(prep.get("cantidad"))
            except (TypeError, ValueError):
                continue
            insumos_prep = _limpiar_insumos(prep.get("insumos"))
            # Una preparación sin ingredientes o sin rendimiento no se puede costear:
            # entraría como una base vacía que ensucia el inventario sin aportar nada.
            if not prep_nombre or unidad not in ("kg", "lt", "unidad") or rendimiento <= 0 or cantidad <= 0:
                continue
            if not insumos_prep:
                continue
            preparaciones.append({
                "nombre": prep_nombre[:120],
                "unidad": unidad,
                "rendimiento": rendimiento,
                "cantidad": cantidad,
                "insumos": insumos_prep,
            })
        salida.append({
            "nombre": nombre[:120],
            "insumos": _limpiar_insumos(item.get("insumos")),
            "preparaciones": preparaciones,
        })
    return salida

@app.post("/leer-carta")
async def leer_carta(file: UploadFile | None = File(None), texto: str = Form("")):
    """Transcribe una carta a lista de productos. Entra una foto del menú o el texto de la
    hoja de cálculo del cliente (Node ya la convirtió a texto plano)."""
    contenido_texto = texto.strip()
    if file is None and not contenido_texto:
        raise HTTPException(400, "Manda una foto del menú o el texto de la lista.")

    if file is not None:
        raw = await file.read()
        _validate_upload(file, raw)
        buf = io.BytesIO()
        _read_upload(raw).save(buf, format="PNG")
        contents = [types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png"), CARTA_PROMPT]
    else:
        # Tope de tamaño: una carta de restaurante no llega ni cerca, y sin él una hoja
        # enorme se lleva por delante la ventana de contexto del modelo.
        if len(contenido_texto) > 60000:
            raise HTTPException(400, "La lista es demasiado larga. Cárgala por partes.")
        contents = [f"{CARTA_PROMPT}\n\nEsta es la lista del cliente:\n\n{contenido_texto}"]

    datos = _pedir_json(contents, CARTA_SCHEMA, "leer la carta")

    productos = []
    for item in datos.get("productos") or []:
        nombre = str(item.get("nombre") or "").strip()
        if not nombre:
            continue
        try:
            precio = float(item.get("precio") or 0)
        except (TypeError, ValueError):
            precio = 0.0
        productos.append({
            "nombre": nombre[:120],
            "categoria": (str(item.get("categoria") or "").strip() or "General")[:120],
            "precio": max(0.0, precio),
            "descripcion": str(item.get("descripcion") or "").strip()[:500],
        })

    return {"productos": productos}


@app.post("/fichas-tecnicas")
async def fichas_tecnicas(payload: dict = Body(...)):
    """Dada una lista de platos, devuelve por cada uno sus insumos y sus preparaciones."""
    platos = payload.get("platos") or []
    if not isinstance(platos, list) or not platos:
        raise HTTPException(400, "Manda al menos un plato.")
    # El lote lo arma Node; acá solo se pone el techo que protege al modelo.
    if len(platos) > 25:
        raise HTTPException(400, "Manda como máximo 25 platos por llamada.")

    lineas = []
    for p in platos:
        if isinstance(p, str):
            lineas.append(f"- {p.strip()[:160]}")
        elif isinstance(p, dict):
            nombre = str(p.get("nombre") or "").strip()[:120]
            if not nombre:
                continue
            extra = str(p.get("descripcion") or "").strip()[:200]
            lineas.append(f"- {nombre}" + (f" ({extra})" if extra else ""))
    if not lineas:
        raise HTTPException(400, "Ninguno de los platos tenía nombre.")

    datos = _pedir_json(
        [f"{FICHAS_PROMPT}\n\nPlatos:\n" + "\n".join(lineas)],
        FICHAS_SCHEMA,
        "armar las fichas técnicas",
    )

    return {"platos": _limpiar_fichas(datos.get("platos"))}


# ---------------------------------------------------------------------------
#  Carga por partes en un cliente que YA está montado
#
#  La carga de carta completa (arriba) sirve para un cliente nuevo. Un cliente
#  que ya opera necesita lo contrario: cargarle SOLO lo que le falta sin tocar
#  lo que ya tiene. De ahí estos dos endpoints — leer su lista de insumos, y
#  decidir cuáles de esos insumos son el mismo que ya tiene en su inventario.

INSUMOS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "insumos": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "nombre": {"type": "STRING"},
                    "unidad": {"type": "STRING", "enum": ["kg", "lt", "unidad"]},
                    "cantidad": {"type": "NUMBER"},
                    "costoUnitario": {"type": "NUMBER"},
                    "minimo": {"type": "NUMBER"},
                    "categoria": {"type": "STRING"},
                },
                "required": ["nombre", "unidad", "cantidad", "costoUnitario"],
            },
        },
    },
    "required": ["insumos"],
}

INSUMOS_PROMPT = (
    "Eres un asistente que transcribe la lista de insumos de un restaurante (su inventario, su "
    "lista de compras o la factura de su proveedor) para cargarla en su sistema. Devuelve TODOS "
    "los insumos que encuentres, en español.\n\n"
    "1. `nombre`: el insumo como lo pondría un almacén, en singular y sin la presentación: "
    "'Saco de harina de trigo 25 kg' se llama 'Harina de trigo'.\n"
    "2. `unidad`: solo 'kg' (lo que se pesa), 'lt' (líquidos) o 'unidad' (lo que se cuenta). "
    "Si la lista trae gramos o mililitros, la unidad sigue siendo kg o lt: se convierte la "
    "cantidad, no la unidad.\n"
    "3. `cantidad`: cuánto hay en existencia, en esa unidad. 500 gramos es 0.5 en 'kg'. Si la "
    "lista no dice existencias, pon 0.\n"
    "4. `costoUnitario`: cuánto cuesta UNA unidad completa (1 kg, 1 lt, 1 unidad), en la moneda "
    "de la lista y sin símbolo. Si la lista da el precio de una presentación, DIVIDE: 'Saco de "
    "harina 25 kg — 30' son 1.2 por kg. Si no hay precio visible, pon 0 — es preferible un cero "
    "evidente a un costo inventado, porque un costo falso ensucia el costo de todas las recetas.\n"
    "5. `minimo`: el stock mínimo o punto de reposición si la lista lo trae; si no, 0.\n"
    "6. `categoria`: el rubro donde lo archivaría un almacén (Carnes, Lácteos, Abarrotes, "
    "Bebidas, Limpieza, Desechables, Salsas, Congelados, Empaques...). Si la lista ya trae "
    "secciones o encabezados que separan bloques, usa esos nombres. Si no los trae, deduce el "
    "rubro por el tipo de insumo — TODOS los insumos tienen que salir con categoría.\n\n"
    "Reglas:\n"
    "- Esto es TRANSCRIPCIÓN, no creación: no agregues insumos que no estén ni inventes precios.\n"
    "- Las celdas de error de Excel (#REF!, #N/A, #VALUE!, #DIV/0!, #NAME?) son fórmulas rotas, "
    "NO son datos: trátalas como vacías y pon 0 en ese campo.\n"
    "- Una hoja de inventario suele traer varias columnas de cantidad (inicial, entrada, salida, "
    "existencia). La que vale para `cantidad` es la EXISTENCIA final; si no hay una columna "
    "clara, usa la última cantidad de la fila.\n"
    "- Si el mismo insumo aparece dos veces (dos compras del mismo producto), devuélvelo UNA "
    "sola vez, sumando las cantidades y usando el precio más reciente.\n"
    "- Puede que te llegue solo un PEDAZO de la lista, sin encabezados: transcribe lo que veas "
    "sin quejarte de que falta contexto.\n"
    "- Ignora todo lo que no sea un insumo: encabezados, totales, impuestos, datos del "
    "proveedor, notas al pie."
)

VINCULAR_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "pares": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "nuevo": {"type": "STRING"},
                    "existente": {"type": "STRING"},
                },
                "required": ["nuevo", "existente"],
            },
        },
    },
    "required": ["pares"],
}

VINCULAR_PROMPT = (
    "Un restaurante ya tiene insumos cargados en su inventario y está subiendo una lista nueva. "
    "Tu trabajo es decidir cuáles de los nombres NUEVOS son el MISMO insumo físico que uno de "
    "los que YA TIENE, para vincularlos en vez de duplicarlos.\n\n"
    "Para cada nombre de la lista NUEVOS devuelve un par: `nuevo` con ese nombre EXACTO tal "
    "como te lo pasaron, y `existente` con el nombre EXACTO de la lista EXISTENTES que le "
    "corresponde, o cadena vacía si no le corresponde ninguno.\n\n"
    "Vincula solo cuando es el mismo ingrediente comprable:\n"
    "- 'Queso mozzarella rallado' y 'Mozzarella' → SÍ, es el mismo queso.\n"
    "- 'Aceite vegetal' y 'Aceite de girasol' → SÍ, cumplen la misma función en la cocina.\n"
    "- 'Carne molida' y 'Carne para milanesa' → NO, son cortes distintos con precio distinto.\n"
    "- 'Leche' y 'Leche condensada' → NO, son productos distintos.\n"
    "- 'Queso cheddar' y 'Queso parmesano' → NO, no se sustituyen.\n\n"
    "Ante la duda, deja `existente` vacío: crear un insumo de más lo arregla el operador en un "
    "segundo, pero vincular mal dos insumos distintos le mete un costo equivocado a todas las "
    "recetas que lo usan y eso no se ve.\n"
    "Devuelve un par por CADA nombre de la lista NUEVOS, ninguno de más."
)


@app.post("/leer-insumos")
async def leer_insumos(file: UploadFile | None = File(None), texto: str = Form("")):
    """Transcribe la lista de insumos del cliente. Entra una foto (inventario escrito,
    factura del proveedor) o el texto de su hoja de cálculo, ya aplanado por Node."""
    contenido_texto = texto.strip()
    if file is None and not contenido_texto:
        raise HTTPException(400, "Manda una foto de la lista o el texto de la hoja.")

    if file is not None:
        raw = await file.read()
        _validate_upload(file, raw)
        buf = io.BytesIO()
        _read_upload(raw).save(buf, format="PNG")
        contents = [types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png"), INSUMOS_PROMPT]
    else:
        if len(contenido_texto) > 60000:
            raise HTTPException(400, "La lista es demasiado larga. Cárgala por partes.")
        contents = [f"{INSUMOS_PROMPT}\n\nEsta es la lista del cliente:\n\n{contenido_texto}"]

    datos = _pedir_json(contents, INSUMOS_SCHEMA, "leer la lista de insumos")

    def num(valor, minimo=0.0):
        try:
            return max(minimo, float(valor or 0))
        except (TypeError, ValueError):
            return minimo

    insumos = []
    for item in datos.get("insumos") or []:
        nombre = str(item.get("nombre") or "").strip()
        unidad = item.get("unidad")
        if not nombre or unidad not in ("kg", "lt", "unidad"):
            continue
        insumos.append({
            "nombre": nombre[:120],
            "unidad": unidad,
            "cantidad": num(item.get("cantidad")),
            "costoUnitario": num(item.get("costoUnitario")),
            "minimo": num(item.get("minimo")),
            "categoria": str(item.get("categoria") or "").strip()[:120],
        })

    return {"insumos": insumos}


@app.post("/vincular-insumos")
async def vincular_insumos(payload: dict = Body(...)):
    """Cruza nombres nuevos contra los que el cliente ya tiene y dice cuál es cuál."""
    nuevos = [str(n).strip()[:120] for n in (payload.get("nuevos") or []) if str(n).strip()]
    existentes = [str(n).strip()[:120] for n in (payload.get("existentes") or []) if str(n).strip()]
    if not nuevos:
        raise HTTPException(400, "Manda al menos un nombre nuevo.")
    if not existentes:
        return {"pares": [{"nuevo": n, "existente": ""} for n in nuevos]}
    # Topes: pasado esto la lista deja de caber cómoda en la ventana del modelo y las
    # equivalencias empiezan a salir peores. Node parte en lotes antes de llegar acá.
    if len(nuevos) > 120 or len(existentes) > 400:
        raise HTTPException(400, "Demasiados insumos por llamada. Cárgalos por partes.")

    prompt = (
        f"{VINCULAR_PROMPT}\n\n"
        "EXISTENTES (lo que el restaurante ya tiene):\n"
        + "\n".join(f"- {n}" for n in existentes)
        + "\n\nNUEVOS (lo que se está subiendo):\n"
        + "\n".join(f"- {n}" for n in nuevos)
    )
    datos = _pedir_json([prompt], VINCULAR_SCHEMA, "cruzar los insumos")

    # Solo se aceptan pares que apunten a nombres realmente presentes en las dos listas:
    # un "existente" alucinado vincularía la línea a un insumo que no es.
    validos_nuevos = set(nuevos)
    validos_existentes = set(existentes)
    pares = []
    vistos = set()
    for par in datos.get("pares") or []:
        nuevo = str(par.get("nuevo") or "").strip()
        existente = str(par.get("existente") or "").strip()
        if nuevo not in validos_nuevos or nuevo in vistos:
            continue
        vistos.add(nuevo)
        pares.append({"nuevo": nuevo, "existente": existente if existente in validos_existentes else ""})
    for n in nuevos:
        if n not in vistos:
            pares.append({"nuevo": n, "existente": ""})

    return {"pares": pares}


RECETAS_PROMPT = (
    "Eres un asistente que transcribe el recetario de un restaurante para cargarlo en su "
    "sistema de inventario. El cliente mandó sus propias fichas técnicas: cada plato con lo "
    "que lleva y cuánto. Devuelve TODOS los platos que encuentres, en español.\n\n"
    "Esto es TRANSCRIPCIÓN, no estimación: las cantidades son las que dice el documento. Si "
    "un plato aparece sin cantidades, devuélvelo igual con sus ingredientes y cantidad 0 — el "
    "operador la completa. NO inventes ingredientes que no estén escritos.\n\n"
    "`insumos`: lo que va directo al plato.\n"
    "  - `unidad` solo puede ser 'kg', 'lt' o 'unidad'. Si el documento trae gramos o "
    "mililitros, convierte la CANTIDAD y deja la unidad en kg/lt: 150 gr es 0.15 en 'kg'.\n"
    "  - `cantidad` es siempre para UNA porción del plato. Si la ficha es para varias "
    "porciones y lo dice, divide entre esas porciones.\n\n"
    "`preparaciones`: solo si el documento las separa como base aparte (salsa, masa, caldo) "
    "con su propio rendimiento. `rendimiento` es lo que da una tanda y sus `insumos` son los "
    "de ESA tanda; `cantidad` es lo que usa el plato. Si el documento no separa nada, deja "
    "`preparaciones` vacío y pon todo como insumos directos.\n\n"
    "Usa el nombre del plato EXACTO como está escrito, y el mismo nombre de preparación "
    "cuando varios platos comparten la base."
)


@app.post("/leer-recetas")
async def leer_recetas(file: UploadFile | None = File(None), texto: str = Form("")):
    """Transcribe el recetario propio del cliente (foto de sus fichas o su hoja de cálculo).

    Comparte esquema con /fichas-tecnicas a propósito: la salida es la misma ficha técnica,
    lo que cambia es de dónde salen los números — acá los dicta el documento del cliente,
    allá los estima el modelo."""
    contenido_texto = texto.strip()
    if file is None and not contenido_texto:
        raise HTTPException(400, "Manda una foto del recetario o el texto de la hoja.")

    if file is not None:
        raw = await file.read()
        _validate_upload(file, raw)
        buf = io.BytesIO()
        _read_upload(raw).save(buf, format="PNG")
        contents = [types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png"), RECETAS_PROMPT]
    else:
        if len(contenido_texto) > 60000:
            raise HTTPException(400, "El recetario es demasiado largo. Cárgalo por partes.")
        contents = [f"{RECETAS_PROMPT}\n\nEste es el recetario del cliente:\n\n{contenido_texto}"]

    datos = _pedir_json(contents, FICHAS_SCHEMA, "leer el recetario")
    return {"platos": _limpiar_fichas(datos.get("platos"))}

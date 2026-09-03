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

import contextvars
import io
import json
import os

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from google import genai
from google.genai import types
from PIL import Image, ImageOps

app = FastAPI(title="QuickTap AI Photo Service")

# Lo que consumió la llamada a Gemini que se está atendiendo ahora mismo.
#
# Un contextvar y no un valor de retorno porque el consumo tiene que salir por IGUAL de los
# endpoints que devuelven JSON y de los que devuelven una imagen cruda, sin cambiarle la forma
# a ninguno: quien llama es Node y no puede romperse por esto. El middleware de abajo lo pasa
# a cabeceras de la respuesta, que Node lee para guardar el gasto en la base.
_uso_actual: contextvars.ContextVar[dict | None] = contextvars.ContextVar("uso_gemini", default=None)


@app.middleware("http")
async def exponer_consumo(request: Request, call_next):
    _uso_actual.set(None)
    response = await call_next(request)
    uso = _uso_actual.get()
    if uso:
        response.headers["X-Gemini-Entrada"] = str(uso.get("entrada", 0))
        response.headers["X-Gemini-Salida"] = str(uso.get("salida", 0))
        response.headers["X-Gemini-Razonamiento"] = str(uso.get("razonamiento", 0))
        response.headers["X-Gemini-Total"] = str(uso.get("total", 0))
        response.headers["X-Gemini-Modelo"] = str(uso.get("modelo", ""))
    return response


def _anotar_consumo(response, modelo: str) -> None:
    """Suma lo que costó esta llamada al acumulado de la petición en curso.

    Se acumula en vez de pisarse porque un solo endpoint puede llamar a Gemini más de una vez
    (analizar-plato analiza y además retoca la foto), y lo que se quiere cobrar es el total de
    la petición, no el de la última llamada.
    """
    try:
        u = response.usage_metadata
        entrada = u.prompt_token_count or 0
        salida = u.candidates_token_count or 0
        total = u.total_token_count or 0
        # El razonamiento no viene en ninguno de los dos contadores pero se cobra igual: es lo
        # que sobra del total. Era el 34% del gasto antes de poder apagarlo.
        razonamiento = max(0, total - entrada - salida)
        previo = _uso_actual.get() or {"entrada": 0, "salida": 0, "razonamiento": 0, "total": 0, "modelo": modelo}
        _uso_actual.set({
            "entrada": previo["entrada"] + entrada,
            "salida": previo["salida"] + salida,
            "razonamiento": previo["razonamiento"] + razonamiento,
            "total": previo["total"] + total,
            "modelo": modelo,
        })
        print(f"[tokens] {modelo}: entrada={entrada} salida={salida} razona={razonamiento} total={total}", flush=True)
    except Exception:
        pass

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

    _anotar_consumo(response, GEMINI_MODEL)

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


def _pedir_json(contents, schema, que_falló: str, pensar: str | None = None) -> dict:
    """Llama a Gemini pidiendo JSON con esquema y devuelve el dict ya parseado.

    `pensar` controla cuánto razona el modelo antes de contestar, y es la diferencia de gasto
    más grande que tiene este servicio. Los modelos Gemini 3 razonan por defecto y esos tokens
    se cobran: clasificar 40 insumos costaba 3.471 tokens y 14 segundos, de los cuales 2.460
    eran razonamiento — para una tarea que es reconocer que el ajinomoto va en Abarrotes. Con
    'minimal' son 1.008 tokens y 3 segundos, con el mismo resultado exacto.

    La regla: 'minimal' para transcribir y clasificar (copiar celdas, poner rubros), nada para
    lo que de verdad decide — estimar los gramos de una receta, resolver si dos insumos con
    nombres distintos son el mismo, elegir el envase de un plato. Ahí el razonamiento es el
    producto y ahorrarlo sale caro en errores.
    """
    client = _get_client()
    cfg: dict = {"response_mime_type": "application/json", "response_schema": schema}
    if pensar:
        cfg["thinking_config"] = types.ThinkingConfig(thinking_level=pensar)
    try:
        response = client.models.generate_content(
            model=GEMINI_VISION_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(**cfg),
        )
    except Exception as exc:
        # Si esta versión del SDK o del modelo no acepta el control de razonamiento, se
        # reintenta sin él: cuesta más, pero funciona. Nunca se cae por una optimización.
        if not pensar:
            raise HTTPException(502, f"Gemini no pudo {que_falló}: {exc}")
        try:
            response = client.models.generate_content(
                model=GEMINI_VISION_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", response_schema=schema
                ),
            )
        except Exception as exc2:
            raise HTTPException(502, f"Gemini no pudo {que_falló}: {exc2}")

    _anotar_consumo(response, GEMINI_VISION_MODEL)

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

    datos = _pedir_json(contents, CARTA_SCHEMA, "leer la carta", pensar="minimal")

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
                    # La unidad TAL CUAL está escrita en la hoja ("gramos", "gr", "ml", "kg",
                    # "paquete"...). Quien convierte gramos a kilos es Node, no el modelo: es
                    # una división por mil y un modelo que se equivoca ahí mete 8.000 kilos de
                    # arroz en el inventario y deja todos los costos mil veces mal.
                    "unidadArchivo": {"type": "STRING"},
                    "cantidadArchivo": {"type": "NUMBER"},
                    "costoArchivo": {"type": "NUMBER"},
                    "minimoArchivo": {"type": "NUMBER"},
                    # Solo como respaldo, para cuando la hoja no dice la unidad o dice una que
                    # no es de peso/volumen ("paquete", "cunete"): en qué se cuenta el insumo.
                    "unidad": {"type": "STRING", "enum": ["kg", "lt", "unidad"]},
                    "categoria": {"type": "STRING"},
                    # Empaque = lo que se lleva el cliente con el pedido (envase, caja, bolsa,
                    # vaso, tapa, cubiertos). Va a la ventana de empaques del inventario y se
                    # puede vincular a un plato para cobrarlo y descontarlo al vender.
                    "esEmpaque": {"type": "BOOLEAN"},
                    # Sin cadena vacía en el enum: Gemini rechaza el esquema entero con
                    # "enum[3]: cannot be empty". Lo que no es empaque simplemente no trae
                    # este campo, que por eso queda fuera de `required`.
                    "tipoEmpaque": {"type": "STRING", "enum": ["ENVASE", "CAJA", "BOLSA"]},
                },
                "required": ["nombre", "unidadArchivo", "cantidadArchivo", "costoArchivo", "unidad"],
            },
        },
    },
    "required": ["insumos"],
}

INSUMOS_PROMPT = (
    "Eres un asistente que transcribe la lista de insumos de un restaurante (su inventario, su "
    "lista de compras o la factura de su proveedor) para cargarla en su sistema. Devuelve TODOS "
    "los insumos que encuentres, en español.\n\n"
    "REGLA MÁS IMPORTANTE: NO CONVIERTAS UNIDADES Y NO HAGAS CUENTAS. Copia los números y la "
    "unidad tal como están escritos en la hoja. Si dice 8000 gramos, devuelves 8000 y "
    "'gramos' — NO 8 ni 'kg'. De convertir se encarga el sistema; si lo haces tú y te "
    "equivocas, entran ocho mil kilos de arroz al inventario y todos los costos quedan mil "
    "veces mal.\n\n"
    "1. `nombre`: el insumo como lo pondría un almacén, en singular y sin la presentación: "
    "'Saco de harina de trigo 25 kg' se llama 'Harina de trigo'.\n"
    "2. `unidadArchivo`: la unidad TAL CUAL aparece en la hoja, sin tocarla: 'gramos', 'gr', "
    "'g', 'kg', 'kilos', 'ml', 'cc', 'lt', 'litros', 'unidades', 'und', 'paquete', 'caja', "
    "'pote', 'cunete', 'cartones'... Si la fila no dice unidad, déjala vacía.\n"
    "3. `cantidadArchivo`: la existencia, EN ESA MISMA UNIDAD y con el número tal cual. Si la "
    "hoja trae varias columnas de cantidad (inicial, entrada, salida, existencia), la que vale "
    "es la EXISTENCIA final; si no hay una columna clara, la última cantidad de la fila. Si no "
    "dice existencias, 0.\n"
    "4. `costoArchivo`: el costo de UNA `unidadArchivo`, tal cual. Si la hoja cobra por gramo "
    "(0.0045), devuelves 0.0045 y NO 4.5. Si no hay precio visible, 0 — es preferible un cero "
    "evidente a un costo inventado, porque un costo falso ensucia el costo de todas las "
    "recetas.\n"
    "5. `minimoArchivo`: el stock mínimo o punto de reposición en esa misma unidad, si la hoja "
    "lo trae; si no, 0.\n"
    "6. `unidad`: en qué se mide de verdad este insumo — 'kg' lo que se pesa, 'lt' los "
    "líquidos, 'unidad' lo que se cuenta. Es el respaldo para cuando `unidadArchivo` viene "
    "vacía o dice una presentación ('paquete', 'cunete', 'cartones'), donde no hay conversión "
    "posible y cada bulto es una unidad.\n"
    "7. `categoria`: el rubro donde lo archivaría un almacén (Carnes, Lácteos, Abarrotes, "
    "Bebidas, Limpieza, Desechables, Salsas, Congelados, Empaques...). Si la lista ya trae "
    "secciones o encabezados que separan bloques, usa esos nombres. Si no los trae, deduce el "
    "rubro por el tipo de insumo — TODOS los insumos tienen que salir con categoría.\n\n"
    "Reglas:\n"
    "- Esto es TRANSCRIPCIÓN, no creación: no agregues insumos que no estén ni inventes "
    "precios.\n"
    "- La ÚNICA cuenta que puedes hacer es multiplicar por la cantidad de bultos cuando la fila "
    "trae presentación y conteo por separado ('Saco de harina | 25 kg | 2 unidades'): ahí "
    "`cantidadArchivo` es 50 y `unidadArchivo` es 'kg'. Nada más.\n"
    "- Las celdas de error de Excel (#REF!, #N/A, #VALUE!, #DIV/0!, #NAME?) son fórmulas rotas, "
    "NO son datos: trátalas como vacías y pon 0 en ese campo.\n"
    "- Si el mismo insumo aparece dos veces (dos compras del mismo producto), devuélvelo UNA "
    "sola vez, con la existencia más reciente y el precio más reciente.\n"
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
    "- 'Carne molida' y 'Carne para milanesa' → NO, son cortes distintos con precio distinto.\n"
    "- 'Leche' y 'Leche condensada' → NO, son productos distintos.\n"
    "- 'Queso cheddar' y 'Queso parmesano' → NO, no se sustituyen.\n"
    "- 'Aceite de soya' y 'Aceite' → NO. Un nombre específico NO se vincula con el genérico del "
    "que cuelga: el aceite de soya, el de palma y el de sésamo cuestan cosas distintas, y "
    "mandarlos todos al 'Aceite' del cliente le pone el mismo precio a los tres.\n"
    "- 'Sésamo negro' y 'Sésamo' → NO, por lo mismo: el detalle que los separa cambia el "
    "precio.\n\n"
    "Cada nombre EXISTENTE puede usarse UNA sola vez en toda tu respuesta. Si dos nombres "
    "nuevos te parecen el mismo existente, dáselo al que se le parezca más y deja el otro "
    "vacío — nunca repitas un existente en dos pares.\n\n"
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

    datos = _pedir_json(contents, INSUMOS_SCHEMA, "leer la lista de insumos", pensar="minimal")

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
        # Se devuelve lo que dice la hoja, sin convertir: la conversión (y la división por mil)
        # la hace Node, que no se equivoca en aritmética.
        insumos.append({
            "nombre": nombre[:120],
            "unidadArchivo": str(item.get("unidadArchivo") or "").strip()[:40],
            "cantidadArchivo": num(item.get("cantidadArchivo")),
            "costoArchivo": num(item.get("costoArchivo")),
            "minimoArchivo": num(item.get("minimoArchivo")),
            "unidad": unidad,
            "categoria": str(item.get("categoria") or "").strip()[:120],
            "esEmpaque": bool(item.get("esEmpaque")),
            "tipoEmpaque": item.get("tipoEmpaque") if item.get("tipoEmpaque") in ("ENVASE", "CAJA", "BOLSA") else "",
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

    datos = _pedir_json(contents, FICHAS_SCHEMA, "leer el recetario", pensar="minimal")
    return {"platos": _limpiar_fichas(datos.get("platos"))}


EMPAQUES_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "pares": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "plato": {"type": "STRING"},
                    "empaque": {"type": "STRING"},
                },
                "required": ["plato", "empaque"],
            },
        },
    },
    "required": ["pares"],
}

EMPAQUES_PROMPT = (
    "Un restaurante despacha sus platos para llevar y tiene cargados sus empaques. Tu trabajo "
    "es decir en qué empaque sale CADA plato, para que el sistema lo cobre y lo descuente del "
    "stock solo. Piensa como quien arma el pedido en la cocina.\n\n"
    "Para cada nombre de la lista PLATOS devuelve un par: `plato` con ese nombre EXACTO tal "
    "como te lo pasaron, y `empaque` con el nombre EXACTO de la lista EMPAQUES que le "
    "corresponde, o cadena vacía si no lleva ninguno.\n\n"
    "Cómo elegir:\n"
    "- Manda el empaque por lo que el plato ES y por cuánto ocupa: una sopa o un caldo va en "
    "un envase hondo con tapa; un plato de arroz o de pasta, en una bandeja; una pizza, en su "
    "caja; una hamburguesa o un sándwich, en caja o envoltura; una ensalada, en un envase "
    "transparente; un postre, en el envase chico.\n"
    "- Si hay varios tamaños del mismo tipo de envase, elige por el tamaño del plato: una "
    "porción individual al chico, algo para compartir o familiar al grande.\n"
    "- Las BEBIDAS EMBOTELLADAS O EN LATA no llevan empaque: salen en su propio envase. Deja "
    "vacío. Un jugo o un batido preparado SÍ lleva vaso.\n"
    "- Un combo o una promoción lleva el empaque de su plato principal.\n"
    "- Las bolsas y los cubiertos NO se vinculan a un plato: se usan una vez por pedido, no "
    "una vez por plato, y vincularlos multiplicaría el cobro por cada cosa que pida el "
    "cliente. Déjalos fuera.\n\n"
    "Ante la duda, deja `empaque` vacío. Vincular el empaque equivocado le cobra de más al "
    "cliente en cada pedido para llevar y le descuenta stock que no usó; no vincular nada solo "
    "deja algo por configurar, que se ve y se arregla.\n"
    "Devuelve un par por CADA plato de la lista, ninguno de más."
)


@app.post("/vincular-empaques")
async def vincular_empaques(payload: dict = Body(...)):
    """Dice en qué empaque sale cada plato, cruzando la carta contra los empaques cargados."""
    platos = [str(n).strip()[:160] for n in (payload.get("platos") or []) if str(n).strip()]
    empaques = [str(n).strip()[:120] for n in (payload.get("empaques") or []) if str(n).strip()]
    if not platos:
        raise HTTPException(400, "Manda al menos un plato.")
    if not empaques:
        return {"pares": [{"plato": p, "empaque": ""} for p in platos]}
    if len(platos) > 120 or len(empaques) > 120:
        raise HTTPException(400, "Demasiados platos o empaques por llamada. Cárgalos por partes.")

    prompt = (
        f"{EMPAQUES_PROMPT}\n\n"
        "EMPAQUES disponibles:\n"
        + "\n".join(f"- {n}" for n in empaques)
        + "\n\nPLATOS:\n"
        + "\n".join(f"- {n}" for n in platos)
    )
    datos = _pedir_json([prompt], EMPAQUES_SCHEMA, "elegir los empaques")

    validos_platos = set(platos)
    validos_empaques = set(empaques)
    pares = []
    vistos = set()
    for par in datos.get("pares") or []:
        plato = str(par.get("plato") or "").strip()
        empaque = str(par.get("empaque") or "").strip()
        if plato not in validos_platos or plato in vistos:
            continue
        vistos.add(plato)
        pares.append({"plato": plato, "empaque": empaque if empaque in validos_empaques else ""})
    for p in platos:
        if p not in vistos:
            pares.append({"plato": p, "empaque": ""})

    return {"pares": pares}


# ---------------------------------------------------------------------------
#  Clasificar insumos ya transcritos
#
#  Cuando la hoja del cliente trae encabezados reconocibles, Node la lee entero
#  con código: nombres, unidades, existencias y costos salen de las celdas, sin
#  modelo de por medio y sin perder una sola fila. Lo único que no está escrito
#  en ninguna celda es en qué rubro va cada insumo y cuál es un empaque, y eso
#  es lo que se pregunta acá — sobre una lista de nombres pelados, que es una
#  fracción de lo que costaba mandarle la hoja entera a transcribir.

CLASIFICAR_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "insumos": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "n": {"type": "STRING"},
                    "c": {"type": "STRING"},
                    "u": {"type": "STRING", "enum": ["kg", "lt", "unidad"]},
                    "e": {"type": "STRING", "enum": ["ENVASE", "CAJA", "BOLSA"]},
                },
                "required": ["n", "c", "u"],
            },
        },
    },
    "required": ["insumos"],
}

CLASIFICAR_PROMPT = (
    "Clasificas los insumos del almacén de un restaurante. Te paso una lista de nombres tal "
    "como están en su inventario y devuelves, para CADA uno, un objeto con estas claves "
    "cortas:\n\n"
    "`n`: el nombre EXACTO tal como te lo pasaron, sin corregirlo ni cambiarle nada. Es lo que "
    "usa el sistema para volver a pegar tu respuesta con su fila.\n"
    "`c`: el rubro donde lo archivaría un almacén — Carnes, Pescados, Lácteos, Verduras, "
    "Frutas, Abarrotes, Salsas, Congelados, Panadería, Bebidas, Licores, Desechables, "
    "Empaques, Limpieza. Usa esos nombres, no inventes rubros nuevos salvo que ninguno sirva. "
    "TODOS los insumos salen con rubro.\n"
    "`u`: en qué se mide — 'kg' lo que se pesa, 'lt' los líquidos, 'unidad' lo que se cuenta. "
    "Si te paso la unidad que ya trae su hoja, respétala; solo decide tú cuando venga vacía.\n"
    "`e`: SOLO si es un empaque, o sea algo que se va con el pedido del cliente — bandejas, "
    "cajas de pizza, bolsas, vasos, tapas, sorbetes, cubiertos desechables. 'ENVASE' para lo "
    "que contiene la comida, 'CAJA' para cajas, 'BOLSA' para bolsas y lo que envuelve por "
    "fuera. Si NO es empaque, no incluyas la clave. Los guantes, el papel film, el detergente "
    "y las servilletas del salón no son empaque: son consumo del local.\n\n"
    "Devuelve un objeto por CADA nombre de la lista, ninguno de más y ninguno de menos. No "
    "agregues insumos, no los agrupes y no los renombres."
)


@app.post("/clasificar-insumos")
async def clasificar_insumos(payload: dict = Body(...)):
    """Rubro, unidad y empaque de una lista de insumos que Node ya leyó de la hoja."""
    crudos = payload.get("insumos") or []
    if not isinstance(crudos, list) or not crudos:
        raise HTTPException(400, "Manda al menos un insumo.")
    if len(crudos) > 200:
        raise HTTPException(400, "Manda como máximo 200 insumos por llamada.")

    lineas = []
    validos = set()
    for item in crudos:
        nombre = (str(item.get("nombre")) if isinstance(item, dict) else str(item)).strip()[:120]
        if not nombre or nombre in validos:
            continue
        validos.add(nombre)
        unidad = str(item.get("unidad") or "").strip()[:20] if isinstance(item, dict) else ""
        lineas.append(f"- {nombre}" + (f" [su hoja dice: {unidad}]" if unidad else ""))
    if not lineas:
        raise HTTPException(400, "Ninguno de los insumos tenía nombre.")

    datos = _pedir_json(
        [f"{CLASIFICAR_PROMPT}\n\nInsumos:\n" + "\n".join(lineas)],
        CLASIFICAR_SCHEMA,
        "clasificar los insumos",
        pensar="minimal",
    )

    salida = []
    vistos = set()
    for item in datos.get("insumos") or []:
        nombre = str(item.get("n") or "").strip()
        # Solo nombres que de verdad se mandaron: uno inventado se pegaría a ninguna fila y
        # uno repetido pisaría la clasificación de la anterior.
        if nombre not in validos or nombre in vistos:
            continue
        vistos.add(nombre)
        salida.append({
            "nombre": nombre,
            "categoria": str(item.get("c") or "").strip()[:120],
            "unidad": item.get("u") if item.get("u") in ("kg", "lt", "unidad") else "",
            "tipoEmpaque": item.get("e") if item.get("e") in ("ENVASE", "CAJA", "BOLSA") else "",
        })

    return {"insumos": salida}

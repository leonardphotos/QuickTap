# Avisos con la app cerrada (push por Firebase)

Con la app **abierta**, los avisos ya funcionan solos: suenan y aparecen en la barra del
sistema. Pero Android congela la app cuando la minimizas un rato, y ahí el aviso deja de
llegar. Para que suene con el teléfono guardado en el bolsillo hace falta **push**, que es un
canal aparte que maneja el propio Android.

El código ya está escrito y funcionando. Solo falta conectar una cuenta de Firebase — es
gratis y no pide tarjeta. **Mientras no lo hagas, nada se rompe**: la app sigue avisando con
normalidad estando abierta.

Son dos archivos que hay que conseguir: uno va en la app, otro en el servidor.

---

## Ojo: son dos nombres distintos

Firebase pide un nombre en dos momentos y es fácil confundirlos:

| Momento | Campo | Qué va |
|---|---|---|
| Al crear el proyecto | Nombre del proyecto | `QuickTap` |
| Al registrar la app Android | Nombre del paquete | `club.quicktap.app` |

El **nombre del proyecto** es solo una etiqueta para ti y **no acepta puntos** — si escribes
ahí `club.quicktap.app` te va a decir *"Solo puede contener letras, números, espacios y los
siguientes caracteres: - ! '"*. Eso significa que estás en el campo equivocado.

El que tiene que coincidir exacto es el **nombre del paquete**, más abajo.

## 1. Crear el proyecto (5 minutos)

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto** → nombre: `QuickTap` (sin puntos) → siguiente.
3. Te ofrece Google Analytics: **desactívalo**, no hace falta.
4. Espera a que lo cree y entra.

## 2. El archivo de la app (`google-services.json`)

1. En la pantalla del proyecto, toca el icono de **Android**.
2. **Nombre del paquete**: escribe exactamente

   ```
   club.quicktap.app
   ```

   Si te equivocas acá, el push no llega nunca y no da ningún error visible.
3. Apodo y SHA-1: déjalos vacíos, no hacen falta.
4. **Registrar app** → **Descargar google-services.json**.
5. Guarda ese archivo en:

   ```
   web/android/app/google-services.json
   ```

6. Los pasos siguientes que muestra Firebase (agregar el SDK, editar los gradle) **sáltatelos**:
   Capacitor ya los tiene puestos.

## 3. El archivo del servidor (cuenta de servicio)

1. En Firebase, engranaje de arriba a la izquierda → **Configuración del proyecto**.
2. Pestaña **Cuentas de servicio**.
3. **Generar nueva clave privada** → confirma. Se descarga un `.json`.
4. Ese archivo es una **credencial secreta**: no lo subas a git ni lo mandes por chat.

Ahora hay que meterlo en el servidor, en una sola línea. En tu Mac:

```bash
python3 -c "import json,sys;print(json.dumps(json.load(open(sys.argv[1]))))" ~/Downloads/EL-ARCHIVO.json
```

Copia el resultado completo (empieza con `{"type":"service_account"...`) y en el servidor:

```bash
ssh quicktap-vps-root
nano /var/www/quicktap/.env
```

Agrega al final, todo en **una sola línea**, entre comillas simples:

```
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

Guarda (Ctrl+O, Enter, Ctrl+X) y reinicia:

```bash
pm2 restart quicktap-api --update-env
```

El `--update-env` es imprescindible: sin él, PM2 reinicia con las variables viejas y parece
que no funcionó.

## 4. Recompilar la app

Con el `google-services.json` ya en su sitio:

```bash
cd web
npm run android:apk
```

Sube `versionCode` en `web/android/app/build.gradle` antes, si vas a publicarla (ver
[ANDROID.md](ANDROID.md)).

## 5. Comprobar que quedó andando

Instala la APK nueva, entra con cualquier usuario y **cierra la app del todo**. Luego, desde
otro teléfono o computadora, haz un pedido de prueba. Debe sonar.

Para confirmar que el teléfono quedó registrado:

```bash
ssh quicktap-vps-root "cd /var/www/quicktap && psql \"\$(grep -E '^DATABASE_URL' .env | sed 's/^DATABASE_URL=//' | tr -d '\"' | sed 's/?.*//')\" -c 'SELECT platform, \"createdAt\" FROM device_tokens;'"
```

Si sale vacío, el teléfono no se registró: revisa que el nombre del paquete en Firebase sea
exactamente `club.quicktap.app` y que hayas aceptado el permiso de notificaciones.

---

## Qué avisa por push

| Evento | Push |
|---|---|
| Pedido nuevo (delivery, mesa, pick-up, barra) | Sí |
| Mesa llama al mesero / pide la cuenta | Sí |
| Insumo que cruza por debajo de su mínimo | Sí |

El de inventario avisa **solo cuando el insumo cruza** el mínimo, no en cada venta que lo
consume — si no, un insumo bajo estaría sonando todo el día. Vuelve a avisar recién cuando lo
repones y baja de nuevo.

## Costo

Firebase Cloud Messaging es **gratis y sin límite** de mensajes. La cuenta de servicio tampoco
cuesta. No hace falta cargar tarjeta.

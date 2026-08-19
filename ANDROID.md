# App de Android (APK)

La app de Android es una **carcasa**: abre `https://quicktap.club` dentro de un WebView. No
lleva el panel adentro, así que **cada despliegue del sitio llega solo a los teléfonos** sin
reinstalar nada. Solo hay que publicar una APK nueva si cambia algo del envoltorio (permisos,
icono, nombre, versión de Capacitor).

Esto la diferencia de la app de escritorio (Electron), que sí empaqueta el panel y se
actualiza sola por su cuenta.

## Requisitos (una sola vez)

- **JDK 21** — en esta Mac quedó en `~/tools/jdk-21.0.12.1+1/Contents/Home`.
- **SDK de Android** — en `~/Library/Android/sdk` (platform 36, build-tools 36.0.0).
- **Llave de firma** — en `~/QuickTap-keys/`, fuera del repositorio.

```bash
export JAVA_HOME=$(cat ~/tools/java_home.txt)
export ANDROID_HOME=~/Library/Android/sdk
export PATH="$JAVA_HOME/bin:$PATH"
```

## Generar la APK

```bash
cd web
npm run android:apk
```

Queda en `web/android/app/build/outputs/apk/release/app-release.apk`.

Para apuntar a otro backend (por ejemplo pruebas), se le pasa la URL:

```bash
CAP_SERVER_URL=https://staging.quicktap.club npm run android:apk
```

## Publicarla

El botón "Descargar para Android" de la home apunta a un asset fijo del último release de
GitHub, igual que el instalador de Windows — así el enlace no se rompe entre versiones:

```
https://github.com/leonardphotos/QuickTap/releases/latest/download/QuickTap.apk
```

Al crear el release hay que **subir la APK con ese nombre exacto: `QuickTap.apk`**.

Antes de publicar una versión nueva, subir `versionCode` (entero, siempre mayor que el
anterior) y `versionName` en `web/android/app/build.gradle`. Android se niega a instalar
encima una APK con `versionCode` menor o igual.

## La llave de firma — leer esto

`~/QuickTap-keys/quicktap-release.keystore` es lo que permite publicar **actualizaciones**.
Android solo deja actualizar una app si la nueva APK está firmada con la misma llave.

**Si se pierde, nadie que ya tenga la app instalada podrá actualizarla nunca más**: habría que
publicar una app distinta (otro `applicationId`) y pedirle a cada quien que desinstale y
reinstale.

Respaldarla fuera de esta computadora (gestor de contraseñas, disco cifrado) junto con
`keystore.properties`, que lleva las claves. Ninguno de los dos está en git ni debe estarlo.

Huella del certificado actual (SHA-256):

```
0E:F0:DB:1B:3F:AF:9C:0A:B4:03:1F:39:53:CB:DB:AD:A7:0C:BD:6F:91:BA:26:78:78:FE:3F:43:AE:09:71:A8
```

## Instalarla en un teléfono

Como no viene de Play Store, Android pide permitir "instalar apps de origen desconocido" al
navegador o al gestor de archivos con el que se abra el APK. Es un permiso por app y se pide
una sola vez.

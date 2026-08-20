# App de iPhone / iPad

Igual que la de Android, es una **carcasa**: abre `https://quicktap.club` dentro de un WebView.
No lleva el panel adentro, así que **cada despliegue del sitio llega solo a los dispositivos**
sin reinstalar nada. Solo hay que subir una versión nueva si cambia algo del envoltorio
(permisos, icono, nombre, versión de Capacitor).

## Lo que iOS NO permite (y en Android sí)

**No existe el equivalente a la APK.** En Android le pasas el archivo a alguien y lo instala; en
iOS eso no se puede. Un `.ipa` suelto no se instala en un iPhone ajeno. Las únicas vías son:

| Vía | Alcance | Requiere |
|---|---|---|
| **App Store** | Cualquiera | Cuenta de desarrollador + revisión de Apple (días) |
| **TestFlight** | Hasta 10.000 probadores invitados | Cuenta de desarrollador + revisión (más liviana) |
| **Ad Hoc** | Hasta 100 dispositivos, registrados uno por uno por su UDID | Cuenta de desarrollador |
| **Xcode directo** | Solo dispositivos conectados por cable a esta Mac | Nada, pero **la app caduca a los 7 días** |

Las tres primeras necesitan el **Apple Developer Program: 99 USD al año**. No hay forma de
saltárselo — es de Apple, no del proyecto.

## Requisitos (una sola vez)

- **Xcode** desde la Mac App Store (~20 GB). Después de instalarlo:
  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  ```
  Hoy la Mac tiene solo las Command Line Tools, que no alcanzan para compilar.
- **CocoaPods NO hace falta.** Capacitor 8 usa Swift Package Manager; el proyecto ya quedó
  generado con `Package.swift` en vez de `Podfile`.
- **Cuenta de Apple Developer** para cualquier cosa que salga de esta Mac (ver tabla arriba).

## Compilar y abrir en Xcode

```bash
cd web
npm run ios:open
```

Eso compila el panel, lo sincroniza al proyecto nativo y abre Xcode.

Para apuntar a otro backend (por ejemplo pruebas):

```bash
CAP_SERVER_URL=https://staging.quicktap.club npm run ios:sync
```

No hay un `ios:ipa` equivalente al `android:apk`: el archivo final se genera desde Xcode
(*Product → Archive*), porque necesita la firma y el perfil de la cuenta de desarrollador.

## Lo que ya quedó configurado

- **Ícono** de QuickTap, opaco y con margen — Apple rechaza íconos con transparencia, y la
  máscara redondeada de iOS recorta lo que quede pegado al borde.
- **Red local (modo sin conexión)**: `NSAllowsLocalNetworking` en `Info.plist`. El relé del
  local vive en una IP privada y no puede tener certificado, así que sin esto iOS bloquearía la
  conexión. Permite HTTP **solo** hacia la red local, no hacia internet. Es el equivalente del
  `network_security_config.xml` de Android.
- **`NSLocalNetworkUsageDescription`**: desde iOS 14 el sistema pide permiso la primera vez que
  la app busca algo en la red local. Sin ese texto, iOS corta la conexión sin avisar.
- **Background mode `remote-notification`**: sin él una push no despierta la app con la pantalla
  apagada.

## Lo que falta para las push (necesita la cuenta de Apple)

El registro de push ya está activo para iOS en el código (`usePushRegistration.ts`), pero del
lado de Apple hace falta:

1. Agregar una app iOS en la consola de Firebase con el bundle `club.quicktap.app` y bajar el
   **`GoogleService-Info.plist`** a `web/ios/App/App/` (está en `.gitignore`, igual que el
   `google-services.json` de Android — no va al repositorio).
2. Crear una **llave APNs (`.p8`)** en el portal de Apple Developer y cargarla en Firebase.
   Es lo que le permite a Firebase entregar en iPhone.
3. En Xcode, activar la capacidad **Push Notifications** en el target App.

Sin esos tres pasos el registro falla en silencio y la app sigue funcionando: el aviso queda
cubierto por el socket en vivo mientras la app esté abierta.

## Riesgo al publicar en la App Store

La guía **4.2 (Minimum Functionality)** de Apple rechaza apps que son solo un sitio web
envuelto. Esta app carga el sitio en vivo, que es exactamente el patrón que más rechazos
recibe. Juegan a favor las funciones nativas reales que ya tiene (push, notificaciones locales,
trabajo en red local sin internet); conviene mencionarlas explícitamente en las notas para el
revisor. TestFlight no pasa por ese filtro con la misma dureza, así que sirve para tener la app
funcionando en los iPhone del equipo mientras se resuelve la publicación.

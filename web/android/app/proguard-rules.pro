# QuickTap — reglas de R8 para la app de Android (envoltorio de WebView con Capacitor).
#
# Capacitor instancia sus plugins POR REFLEXIÓN, leyendo la lista de clases que genera
# capacitor.build.gradle. R8 no ve esas referencias y, sin estas reglas, borraría los plugins
# o les cambiaría el nombre y la app arrancaría con la pantalla en blanco.

# Plugins y núcleo de Capacitor / Cordova.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class org.apache.cordova.** { *; }

# Métodos expuestos al JavaScript del WebView: se invocan por nombre desde la página.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Nuestro propio paquete (MainActivity y lo que el manifiesto referencia por nombre).
-keep class club.quicktap.app.** { *; }

# Firebase / notificaciones push: el SDK también resuelve por reflexión.
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Silencia avisos de dependencias opcionales que no empaquetamos.
-dontwarn org.slf4j.**
-dontwarn javax.annotation.**

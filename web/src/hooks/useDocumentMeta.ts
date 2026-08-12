import { useEffect } from 'react';

/**
 * Título y descripción de la pestaña/buscador para una ruta puntual.
 *
 * Sirve para las páginas de marketing (`/`, `/planes`, `/legal`): Google sí ejecuta
 * JavaScript, así que alcanza con ponerlas desde el cliente. Su vista previa al
 * compartir ya la cubren las etiquetas por defecto de `web/index.html`.
 *
 * OJO: esto NO sirve para las páginas públicas de cada negocio (/r/, /tienda/,
 * /club/). Los crawlers de WhatsApp, Facebook y Twitter no ejecutan JavaScript y
 * nunca verían nada de lo que haga este hook — esas rutas las arma el backend, ver
 * src/modules/seo/seo.service.ts.
 */
export function useDocumentMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title;

    if (!description) return;
    // El <meta> ya existe en index.html; acá solo se actualiza su contenido.
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = description;
  }, [title, description]);
}

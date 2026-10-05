import type L from 'leaflet';

const MAPBOX_ACCESS_TOKEN = String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim();

/**
 * Capa cartografica comun de QuickTap. Mapbox es el proveedor principal que ya usa
 * el portal del motorizado; el endpoint publico de OSM queda solo como respaldo
 * local cuando no se configuro el token.
 */
export function quickTapTileDefinition(dark = false): [string, L.TileLayerOptions] {
  if (MAPBOX_ACCESS_TOKEN) {
    const style = dark ? 'dark-v11' : 'streets-v12';
    return [
      `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`,
      {
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1,
        // El sitio usa no-referrer; Mapbox necesita el dominio para validar el token.
        // Solo se envía el origen, nunca la ruta ni parámetros de la página.
        referrerPolicy: 'origin',
        attribution:
          '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    ];
  }

  return [
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxNativeZoom: 19,
      referrerPolicy: 'origin',
      maxZoom: 20,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  ];
}

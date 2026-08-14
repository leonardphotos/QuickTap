import fs from 'fs';
import path from 'path';
import { BusinessType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { isLocked } from '../../utils/subscription';
import { listStaticSeoPages } from './static-pages';

/**
 * SEO de las páginas públicas por negocio.
 *
 * El frontend es una SPA de Vite renderizada en el cliente: el HTML que sale de
 * `web/dist/index.html` trae un `<div id="root">` vacío. Los crawlers de WhatsApp,
 * Facebook, Instagram y Twitter NO ejecutan JavaScript, así que un link de menú
 * compartido por WhatsApp llegaba sin ninguna vista previa. Google sí ejecuta JS,
 * pero indexa antes y mejor lo que ya viene servido en el HTML.
 *
 * La solución NO es SSR: se sirve el mismo `index.html` compilado, reemplazando
 * solo el bloque marcado entre `<!-- seo:start -->` y `<!-- seo:end -->` por las
 * etiquetas de ese negocio. React hidrata exactamente igual que antes.
 *
 * Se sirve el MISMO HTML a todo el mundo (no se mira el User-Agent): distinguir
 * crawlers de personas es frágil y Google lo puede leer como cloaking.
 */

// Deben coincidir con los comentarios centinela de web/index.html.
const SEO_START = '<!-- seo:start -->';
const SEO_END = '<!-- seo:end -->';

/** Prefijo de URL pública -> vertical de negocio que le corresponde. Un slug de
 * restaurante no debe abrir /tienda/ (mismo criterio que shop-storefront.service.ts):
 * evita que el mismo negocio quede indexado bajo tres URLs distintas. */
export const PUBLIC_PREFIXES: Record<string, BusinessType> = {
  '/r': BusinessType.RESTAURANT,
  '/tienda': BusinessType.SHOP,
  '/club': BusinessType.SPORTS_CLUB,
};

const PREFIX_BY_TYPE: Record<BusinessType, string> = {
  [BusinessType.RESTAURANT]: '/r',
  [BusinessType.SHOP]: '/tienda',
  [BusinessType.SPORTS_CLUB]: '/club',
};

/** Tipo de schema.org por vertical, para el JSON-LD de la página del negocio. */
const SCHEMA_TYPE: Record<BusinessType, string> = {
  [BusinessType.RESTAURANT]: 'Restaurant',
  [BusinessType.SHOP]: 'Store',
  [BusinessType.SPORTS_CLUB]: 'SportsActivityLocation',
};

const DEFAULT_DESCRIPTION: Record<BusinessType, string> = {
  [BusinessType.RESTAURANT]: 'Mira el menú y pide en línea.',
  [BusinessType.SHOP]: 'Mira el catálogo y haz tu pedido en línea.',
  [BusinessType.SPORTS_CLUB]: 'Reserva tu cancha en línea.',
};

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  image: string;
  /** false = se sirve el shell con `noindex` (negocio inexistente, inactivo o bloqueado). */
  indexable: boolean;
  jsonLd?: Record<string, unknown>;
}

/**
 * Escapa para interpolar dentro de un atributo HTML entre comillas dobles.
 * Imprescindible: el nombre y la descripción los escribe el dueño del negocio desde
 * su panel, así que sin escapar podría cerrar el atributo e inyectar HTML en el shell.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Recorta a un largo cómodo para un snippet de buscador, sin cortar una palabra por la mitad. */
function truncate(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Las fotos subidas se guardan como ruta relativa (/uploads/...); OG exige URL absoluta. */
function absoluteUrl(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value;
  return `${env.appUrl.replace(/\/$/, '')}${value.startsWith('/') ? '' : '/'}${value}`;
}

const DEFAULT_IMAGE = `${env.appUrl.replace(/\/$/, '')}/logo/quicktap-color.png`;

// --- Shell HTML compilado -----------------------------------------------------

/** `web/dist/index.html`. En el VPS el backend y el frontend viven en el mismo
 * directorio (/var/www/quicktap), así que dist es una carpeta hermana. */
const WEB_DIST_PATH = process.env.WEB_DIST_PATH ?? path.resolve(__dirname, '../../../web/dist');

let cachedShell: string | null = null;

function loadShell(): string | null {
  // En desarrollo no se cachea: el frontend lo sirve Vite y el dist puede estar viejo
  // o no existir, y así un rebuild se refleja sin reiniciar el backend.
  if (env.isProd && cachedShell) return cachedShell;
  try {
    const html = fs.readFileSync(path.join(WEB_DIST_PATH, 'index.html'), 'utf8');
    if (env.isProd) cachedShell = html;
    return html;
  } catch {
    return null;
  }
}

/** Reemplaza el bloque centinela del shell por las etiquetas de esta página. */
export function renderShell(meta: PageMeta): string | null {
  const shell = loadShell();
  if (!shell) return null;

  const start = shell.indexOf(SEO_START);
  const end = shell.indexOf(SEO_END);
  // Sin los marcadores no se puede inyectar nada: se devuelve el shell tal cual
  // (peor SEO, pero la página sigue funcionando) en vez de romper la respuesta.
  if (start === -1 || end === -1 || end < start) return shell;

  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(meta.canonical);
  const image = escapeHtml(meta.image);

  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    meta.indexable
      ? '<meta name="robots" content="index, follow, max-image-preview:large" />'
      : '<meta name="robots" content="noindex, follow" />',
    '<meta property="og:site_name" content="QuickTap" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="es_VE" />',
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];

  if (meta.jsonLd) {
    // El JSON va dentro de <script>, no de un atributo: lo peligroso acá no son las
    // comillas sino un "</script>" dentro de un nombre. JSON.stringify no lo escapa.
    const json = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
    tags.push(`<script type="application/ld+json">${json}</script>`);
  }

  return shell.slice(0, start) + tags.join('\n    ') + shell.slice(end + SEO_END.length);
}

// --- Meta por negocio ---------------------------------------------------------

/**
 * Etiquetas de la página pública de un negocio. Devuelve `indexable: false` (y el
 * texto genérico) si el negocio no existe, no corresponde a ese prefijo, está
 * inactivo o está bloqueado por falta de pago — nunca lanza: un visitante real
 * debe recibir la página igual, es el crawler el que no debe indexarla.
 */
export async function buildMetaForSlug(prefix: string, slug: string): Promise<PageMeta> {
  const origin = env.appUrl.replace(/\/$/, '');
  const canonical = `${origin}${prefix}/${encodeURIComponent(slug)}`;
  const fallback: PageMeta = {
    title: 'QuickTap',
    description: 'Menú digital, pedidos y punto de venta para tu negocio.',
    canonical,
    image: DEFAULT_IMAGE,
    indexable: false,
  };

  const expectedType = PUBLIC_PREFIXES[prefix];
  if (!expectedType) return fallback;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      name: true,
      description: true,
      logoUrl: true,
      businessType: true,
      isActive: true,
      isDemo: true,
      suspended: true,
      periodEnd: true,
      parentRestaurantId: true,
      fullscreenImageUrl: true,
    },
  });

  if (!restaurant || !restaurant.isActive || restaurant.businessType !== expectedType) return fallback;
  if (await isBusinessLocked(restaurant)) return fallback;

  const type = restaurant.businessType;
  const description = truncate(restaurant.description?.trim() || DEFAULT_DESCRIPTION[type]);
  const title = `${restaurant.name} — ${type === BusinessType.SPORTS_CLUB ? 'Reserva tu cancha' : 'Menú y pedidos en línea'}`;
  // La imagen de portada (Modo Cartelera) es apaisada y se ve mejor que el logo
  // cuadrado en la tarjeta de WhatsApp; el logo queda de respaldo.
  const image = absoluteUrl(restaurant.fullscreenImageUrl ?? restaurant.logoUrl, DEFAULT_IMAGE);

  return {
    title,
    description,
    canonical,
    image,
    // El restaurante de demostración se reinicia solo y no es un negocio real.
    indexable: !restaurant.isDemo,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': SCHEMA_TYPE[type],
      name: restaurant.name,
      description,
      url: canonical,
      image,
      ...(restaurant.logoUrl ? { logo: absoluteUrl(restaurant.logoUrl, DEFAULT_IMAGE) } : {}),
    },
  };
}

/** Una sucursal se bloquea con el estado de su sede principal, no con el propio
 * (misma regla que isLockedAsync en utils/subscription.ts). */
async function isBusinessLocked(restaurant: {
  suspended: boolean;
  periodEnd: Date;
  parentRestaurantId: string | null;
}): Promise<boolean> {
  if (!restaurant.parentRestaurantId) return isLocked(restaurant);
  const parent = await prisma.restaurant.findUnique({
    where: { id: restaurant.parentRestaurantId },
    select: { periodEnd: true, suspended: true },
  });
  return isLocked(parent ?? restaurant);
}

// --- Sitemap ------------------------------------------------------------------

/** Páginas fijas del sitio, con su prioridad relativa. Las páginas SEO por cluster
 * (servicios, precios, comparativa y verticales) salen de static-pages.ts. */
const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  ...listStaticSeoPages().map((p) => ({ path: p.path, priority: p.priority, changefreq: 'monthly' })),
  { path: '/legal', priority: '0.3', changefreq: 'yearly' },
];

/**
 * sitemap.xml con las páginas fijas más la página pública de cada negocio activo.
 * Se excluyen los inactivos, el demo y los bloqueados por falta de pago — mismo
 * criterio con el que el menú público responde 403 (ver menu.service.ts).
 */
export async function buildSitemap(): Promise<string> {
  const origin = env.appUrl.replace(/\/$/, '');

  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true, isDemo: false },
    select: {
      slug: true,
      businessType: true,
      updatedAt: true,
      suspended: true,
      periodEnd: true,
      parentRestaurantId: true,
    },
  });

  // El estado de bloqueo de una sucursal depende de su sede principal. Se resuelve en
  // memoria contra el mismo listado en vez de consultar por cada una (evita el N+1 que
  // tendría llamar a isLockedAsync en un bucle).
  const byId = new Map<string, { suspended: boolean; periodEnd: Date }>();
  const withIds = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: { id: true, suspended: true, periodEnd: true },
  });
  for (const r of withIds) byId.set(r.id, { suspended: r.suspended, periodEnd: r.periodEnd });

  const urls = STATIC_PAGES.map(
    (page) =>
      `  <url>\n    <loc>${origin}${page.path}</loc>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`,
  );

  for (const r of restaurants) {
    const effective = r.parentRestaurantId ? byId.get(r.parentRestaurantId) ?? r : r;
    if (isLocked(effective)) continue;
    const loc = `${origin}${PREFIX_BY_TYPE[r.businessType]}/${encodeURIComponent(r.slug)}`;
    urls.push(
      `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

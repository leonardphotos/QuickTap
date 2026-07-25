import { badRequest } from '../../utils/http-error';

/**
 * Cliente delgado para la API Pública de OlaClick (developers.olaclick.app).
 * Uso exclusivo del panel master — ver CLAUDE.md / README de esta migración
 * para el contexto de por qué esto NUNCA se expone al restaurante.
 */

const BASE_URL = 'https://public-api.olaclick.app';

export interface OlaclickVariant {
  id: string;
  name: string;
  price: number; // unidades menores (centavos)
  currency: string;
}

export interface OlaclickProduct {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  available: boolean;
  image_url?: string | null;
  variants: OlaclickVariant[];
}

export interface OlaclickCategory {
  id: string;
  name: string;
  slug: string;
  position: number;
  products: OlaclickProduct[];
}

async function olaclickRequest(
  apiKey: string,
  path: string,
  query?: Record<string, string | number | undefined>,
  maxRetries = 3,
): Promise<any> {
  if (!apiKey || !apiKey.startsWith('olk_')) {
    throw badRequest("API Key de OlaClick inválida o ausente (debe iniciar con 'olk_').");
  }

  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    });

    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt > maxRetries) {
      if (res.status === 401) {
        throw badRequest('OlaClick rechazó la API Key. Pide al restaurante que genere una nueva.');
      }
      if (res.status === 403) {
        throw badRequest("La API Key no tiene el permiso 'menu:read'. Debe regenerarse con ese scope.");
      }
      throw badRequest(`OlaClick respondió ${res.status} al consultar ${path}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
  }
}

/** Trae el menú completo (todas las páginas) de la cuenta dueña de esta API Key. */
export async function fetchOlaclickMenu(apiKey: string): Promise<OlaclickCategory[]> {
  const categories: OlaclickCategory[] = [];
  let page = 1;

  while (true) {
    const response = await olaclickRequest(apiKey, '/v1/menu', { page, per_page: 50 });
    categories.push(...(response?.data?.categories ?? []));
    if (!response?.pagination?.has_more) break;
    page++;
  }

  return categories;
}

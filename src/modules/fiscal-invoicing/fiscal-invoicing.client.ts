import { sha512Hex } from './fiscal-invoicing.crypto';

/**
 * Cliente HTTP puro hacia la REST API de Corporación Unidigital
 * (docs.unidigital.global) — aísla URLs, el hash de la contraseña y el
 * envelope de error estándar de Unidigital del resto del módulo.
 */

const BASE_URL: Record<'QA' | 'PRODUCTION', string> = {
  QA: 'https://qa.unidigital.global/digitalinvoice-core',
  PRODUCTION: 'https://www.unidigital.global/digitalinvoice-core',
};

export class UnidigitalApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'UnidigitalApiError';
  }
}

interface UnidigitalErrorEnvelope {
  errors?: { code?: string; message?: string }[];
}

interface LoginResponse {
  userName: string;
  accessToken: string;
  series: { name: string; strongId: string }[];
}

interface CreateAndApproveResponse {
  // No se confirmó el shape exacto de esta respuesta contra la colección
  // Postman real — se asume un StrongId de documento como mínimo. Ajustar
  // cuando se prueben credenciales sandbox reales.
  strongId?: string;
  [key: string]: unknown;
}

async function request<T>(
  environment: 'QA' | 'PRODUCTION',
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, ...rest } = init;
  const res = await fetch(`${BASE_URL[environment]}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...rest.headers,
    },
  });

  if (!res.ok) {
    let message = `Unidigital respondió ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as UnidigitalErrorEnvelope;
      const first = body.errors?.[0];
      if (first?.message) message = first.message;
      code = first?.code;
    } catch {
      // Respuesta sin JSON (ej. 500 de infraestructura) — se usa el mensaje genérico.
    }
    throw new UnidigitalApiError(message, res.status, code);
  }

  return (await res.json()) as T;
}

export const fiscalInvoicingClient = {
  async login(environment: 'QA' | 'PRODUCTION', username: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>(environment, '/user/login', {
      method: 'POST',
      body: JSON.stringify({ UserName: username, Password: sha512Hex(password) }),
    });
  },

  /** Crea el ciclo, agrega el documento y lo aprueba en una sola llamada. */
  async createAndApprove(
    environment: 'QA' | 'PRODUCTION',
    accessToken: string,
    document: Record<string, unknown>,
  ): Promise<CreateAndApproveResponse> {
    return request<CreateAndApproveResponse>(environment, '/documents/createandapprove', {
      method: 'POST',
      accessToken,
      body: JSON.stringify(document),
    });
  },

  /**
   * Números de control tardan 1-5 min en asignarse — se consulta después, no
   * en el momento. Path exacto ("Obtener números de control por ciclo", carpeta
   * "Números de control" de la colección Postman) no se confirmó campo a campo
   * en esta sesión — verificar contra el fork de Postman antes de depender de esto.
   */
  async getControlNumberByCycle(
    environment: 'QA' | 'PRODUCTION',
    accessToken: string,
    batchStrongId: string,
  ): Promise<unknown> {
    return request(environment, `/controlnumbers/bycycle/${batchStrongId}`, {
      method: 'GET',
      accessToken,
    });
  },

  async voidDocument(environment: 'QA' | 'PRODUCTION', accessToken: string, documentStrongId: string): Promise<unknown> {
    return request(environment, '/documents/anulled', {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ DocumentStrongId: documentStrongId }),
    });
  },
};

import { env } from '../../config/env';

/**
 * Cliente de la pasarela Ramblay. Confirmado contra https://ramblay.com/api-reference:
 * el recurso que se crea es un "Payframe" (una sesión de checkout hospedada,
 * como un Checkout Session de Stripe) — no un "payment" suelto. C2P se pide
 * como payment_method_type; Binance Pay NO se configura aquí, se habilita
 * desde el panel de Ramblay (Payment Gateways → Binance), y aparece solo en
 * el checkout hospedado una vez conectado.
 *
 * payment_method_types incluye también "pago_movil": a diferencia de C2P
 * (confirmación instantánea del banco), este es un método "manual/reportable"
 * — el cliente sube su comprobante y alguien con acceso al dashboard de
 * Ramblay debe verificarlo a mano antes de que dispare el webhook de
 * "completado". Se agregó a propósito como alternativa para quienes no
 * saben usar C2P, aceptando esa revisión manual (ya no ocurre en el panel
 * de QuickTap, sino en el de Ramblay).
 *
 * Auth: Authorization: Bearer sk_... — POST https://api.ramblay.com/payframes
 */

export interface RamblayCreatePaymentInput {
  /** Monto en USD (nunca confiar en un monto que venga del cliente). Se convierte a centavos enteros. */
  amount: number;
  productName: string;
  productDescription?: string;
  /** Nuestra propia referencia (el id del PlanRequest): Ramblay la devuelve tal cual en el webhook. */
  clientReferenceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface RamblayCreatePaymentResult {
  /** Id del Payframe en Ramblay (pf_...) — se guarda en PlanRequest.ramblayPaymentId para cruzar con el webhook. */
  payframeId: string;
  /** URL del checkout hospedado a la que se redirige al cliente para pagar. */
  checkoutUrl: string;
}

class RamblayApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'RamblayApiError';
  }
}

export const ramblayClient = {
  async createPayment(input: RamblayCreatePaymentInput): Promise<RamblayCreatePaymentResult> {
    if (!env.ramblay.apiKey) {
      throw new RamblayApiError('RAMBLAY_API_KEY no está configurada en el servidor.');
    }

    const res = await fetch(`${env.ramblay.baseUrl}/payframes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ramblay.apiKey}`,
      },
      body: JSON.stringify({
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.clientReferenceId,
        payment_method_types: ['c2p', 'pago_movil'],
        line_items: [
          {
            inline_price: {
              unit_amount: Math.round(input.amount * 100),
              product: {
                name: input.productName,
                description: input.productDescription,
              },
            },
            quantity: 1,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new RamblayApiError(`Ramblay respondió ${res.status} al crear el payframe: ${body}`, res.status);
    }

    const data = (await res.json()) as { id?: string; hosted_url?: string };
    if (!data.id || !data.hosted_url) {
      throw new RamblayApiError('La respuesta de Ramblay no trajo id/hosted_url.');
    }

    return { payframeId: data.id, checkoutUrl: data.hosted_url };
  },
};

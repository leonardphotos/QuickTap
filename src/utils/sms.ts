import { env } from '../config/env';

/**
 * Envío de SMS por enviatusms.com (https://www.enviatusms.com/desarrolladores).
 *
 * La API acepta el número en formato local venezolano (04141234567) o internacional, así que
 * se manda tal cual lo tenemos guardado, solo limpiado a dígitos. La API key viaja como
 * parámetro de la URL porque así lo define el proveedor.
 *
 * Sin API key configurada, el mensaje se imprime en consola y se da por "enviado": es el modo
 * desarrollo, igual que hace el correo de restablecer contraseña. En producción la falta de
 * entrega se nota al minuto (el cliente no recibe su código), no hace falta tumbarse antes.
 */
export async function enviarSms(telefono: string, texto: string): Promise<void> {
  const numero = telefono.replace(/\D/g, '');
  if (!numero) throw new Error('Teléfono vacío para el SMS.');

  if (!env.sms.enviatusmsApiKey) {
    console.log(`📱 [SMS sin API key — solo consola] a ${numero}: ${texto}`);
    return;
  }

  const res = await fetch(`https://www.enviatusms.com/api/sms-multi?api_key=${env.sms.enviatusmsApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numeros: [numero], texto }),
    // La pantalla de login queda esperando esta respuesta: mejor un error a los 10s que un
    // formulario colgado si el proveedor no responde.
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await res.json().catch(() => null)) as { status?: string; msg?: string; ignored?: string[] } | null;
  if (!res.ok || data?.status !== 'ok') {
    throw new Error(`enviatusms respondió mal: ${data?.msg ?? res.status}`);
  }
  // "ignored" trae los números que el proveedor descartó (formato inválido, etc.). Para un
  // solo destinatario eso ES un fallo de entrega, aunque el status general diga ok.
  if (data.ignored?.length) {
    throw new Error(`enviatusms ignoró el número ${numero}.`);
  }
}

import { Resend } from 'resend';
import { env } from '../config/env';

const resend = env.mail.resendApiKey ? new Resend(env.mail.resendApiKey) : null;

/**
 * Si RESEND_API_KEY no está configurada (típico en desarrollo local), el
 * correo se imprime en la consola en vez de enviarse de verdad.
 */
export async function sendMail(to: string, subject: string, html: string) {
  if (!resend) {

    console.log(`📧 [mailer simulado, falta configurar RESEND_API_KEY] Para: ${to} — ${subject}\n${html}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: `${env.mail.fromName} <${env.mail.fromEmail}>`,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`No se pudo enviar el correo: ${error.message}`);
  }
}

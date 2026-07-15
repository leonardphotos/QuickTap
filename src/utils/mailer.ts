import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter =
  env.mail.user && env.mail.appPassword
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: env.mail.user, pass: env.mail.appPassword },
      })
    : null;

/**
 * Si MAIL_USER/MAIL_APP_PASSWORD no están configurados (típico en desarrollo
 * local), el correo se imprime en la consola en vez de enviarse de verdad.
 */
export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    // eslint-disable-next-line no-console
    console.log(`📧 [mailer simulado, falta configurar MAIL_USER/MAIL_APP_PASSWORD] Para: ${to} — ${subject}\n${html}`);
    return;
  }

  await transporter.sendMail({
    from: `"${env.mail.fromName}" <${env.mail.user}>`,
    to,
    subject,
    html,
  });
}

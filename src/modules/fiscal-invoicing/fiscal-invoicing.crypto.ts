import crypto from 'crypto';

/**
 * Cifrado simétrico (AES-256-GCM) para la contraseña de Unidigital que se
 * guarda en FiscalInvoicingConfig.passwordEncrypted — mismo patrón que
 * master-olaclick-import.crypto.ts. Requiere FISCAL_INVOICING_ENCRYPTION_KEY
 * (32 bytes en base64) — generar una sola vez con:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

function getKey(): Buffer {
  const raw = process.env.FISCAL_INVOICING_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'Falta la variable de entorno FISCAL_INVOICING_ENCRYPTION_KEY (32 bytes en base64).',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('FISCAL_INVOICING_ENCRYPTION_KEY debe decodificar a exactamente 32 bytes.');
  }
  return key;
}

export function encryptFiscalPassword(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
}

export function decryptFiscalPassword(payload: string): string {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = payload.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Unidigital exige sha512(password) en texto hexadecimal antes de loguearse. */
export function sha512Hex(plainText: string): string {
  return crypto.createHash('sha512').update(plainText, 'utf8').digest('hex');
}

export interface CountryDialCode {
  /** Código ISO 3166-1 alfa-2. */
  code: string;
  name: string;
  /** Código de marcación internacional, sin "+" (ej: "58" para Venezuela). */
  dialCode: string;
}

/**
 * Lista de países + código de marcación, usada en el registro de
 * restaurantes para armar el número de WhatsApp en formato internacional
 * (dialCode + número local, sin el 0 inicial). Ordenada alfabéticamente por
 * nombre en español, con Venezuela primero por ser el mercado principal.
 */
export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { code: 'VE', name: 'Venezuela', dialCode: '58' },
  { code: 'AR', name: 'Argentina', dialCode: '54' },
  { code: 'BO', name: 'Bolivia', dialCode: '591' },
  { code: 'BR', name: 'Brasil', dialCode: '55' },
  { code: 'CA', name: 'Canadá', dialCode: '1' },
  { code: 'CL', name: 'Chile', dialCode: '56' },
  { code: 'CO', name: 'Colombia', dialCode: '57' },
  { code: 'CR', name: 'Costa Rica', dialCode: '506' },
  { code: 'CU', name: 'Cuba', dialCode: '53' },
  { code: 'DK', name: 'Dinamarca', dialCode: '45' },
  { code: 'EC', name: 'Ecuador', dialCode: '593' },
  { code: 'SV', name: 'El Salvador', dialCode: '503' },
  { code: 'ES', name: 'España', dialCode: '34' },
  { code: 'US', name: 'Estados Unidos', dialCode: '1' },
  { code: 'FR', name: 'Francia', dialCode: '33' },
  { code: 'GT', name: 'Guatemala', dialCode: '502' },
  { code: 'HN', name: 'Honduras', dialCode: '504' },
  { code: 'IN', name: 'India', dialCode: '91' },
  { code: 'IT', name: 'Italia', dialCode: '39' },
  { code: 'JP', name: 'Japón', dialCode: '81' },
  { code: 'MX', name: 'México', dialCode: '52' },
  { code: 'NI', name: 'Nicaragua', dialCode: '505' },
  { code: 'NO', name: 'Noruega', dialCode: '47' },
  { code: 'NL', name: 'Países Bajos', dialCode: '31' },
  { code: 'PA', name: 'Panamá', dialCode: '507' },
  { code: 'PY', name: 'Paraguay', dialCode: '595' },
  { code: 'PE', name: 'Perú', dialCode: '51' },
  { code: 'PT', name: 'Portugal', dialCode: '351' },
  { code: 'GB', name: 'Reino Unido', dialCode: '44' },
  { code: 'DO', name: 'República Dominicana', dialCode: '1' },
  { code: 'DE', name: 'Alemania', dialCode: '49' },
  { code: 'SE', name: 'Suecia', dialCode: '46' },
  { code: 'CH', name: 'Suiza', dialCode: '41' },
  { code: 'UY', name: 'Uruguay', dialCode: '598' },
  { code: 'PR', name: 'Puerto Rico', dialCode: '1' },
  { code: 'CN', name: 'China', dialCode: '86' },
  { code: 'KR', name: 'Corea del Sur', dialCode: '82' },
  { code: 'AU', name: 'Australia', dialCode: '61' },
  { code: 'NZ', name: 'Nueva Zelanda', dialCode: '64' },
];

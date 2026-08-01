import { useState } from 'react';
import { COUNTRY_DIAL_CODES } from '@/data/dialCodes';

/**
 * Mismo país+prefijo+número local que ya usaba RegisterPage.tsx para el WhatsApp del
 * restaurante al registrarse — factorizado aquí para reutilizarlo en cualquier otro lugar
 * donde el staff tipee un número de WhatsApp a mano (verificador de pagos, repartidor,
 * sucursal, etc.), evitando que alguien escriba el número en formato local sin código de
 * país (causa real de que el chatbot le mande mensajes a un contacto inexistente).
 *
 * `value`/`onChange` siempre manejan el número completo en formato internacional, solo
 * dígitos, sin "+" (ej. "584141234567") — listo para guardarse tal cual y usarse como JID
 * de WhatsApp. El 0 inicial que alguien tipee por costumbre (formato local) se descarta solo.
 */

const DIAL_CODES_BY_LENGTH_DESC = [...COUNTRY_DIAL_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);

function splitValue(value: string): { countryCode: string; localPhone: string } {
  const digits = value.replace(/\D/g, '');
  if (!digits) return { countryCode: 'VE', localPhone: '' };
  const match = DIAL_CODES_BY_LENGTH_DESC.find((c) => digits.startsWith(c.dialCode));
  if (!match) return { countryCode: 'VE', localPhone: digits };
  return { countryCode: match.code, localPhone: digits.slice(match.dialCode.length) };
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function WhatsappPhoneInput({ value, onChange, placeholder = '4141234567', disabled, id }: Props) {
  const initial = splitValue(value);
  const [countryCode, setCountryCode] = useState(initial.countryCode);
  const [localPhone, setLocalPhone] = useState(initial.localPhone);

  const dialCode = COUNTRY_DIAL_CODES.find((c) => c.code === countryCode)?.dialCode ?? '58';

  function emit(nextCountryCode: string, nextLocalPhone: string) {
    const nextDialCode = COUNTRY_DIAL_CODES.find((c) => c.code === nextCountryCode)?.dialCode ?? '58';
    const digits = nextLocalPhone.trim().replace(/\D/g, '').replace(/^0+/, '');
    onChange(digits ? `${nextDialCode}${digits}` : '');
  }

  return (
    <div className="flex gap-2">
      <select
        id={id}
        value={countryCode}
        disabled={disabled}
        onChange={(e) => {
          setCountryCode(e.target.value);
          emit(e.target.value, localPhone);
        }}
        className="w-36 shrink-0 border border-brand-950/15 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50"
      >
        {COUNTRY_DIAL_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} (+{c.dialCode})
          </option>
        ))}
      </select>
      <div className="relative flex-1 min-w-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-950/40 text-sm pointer-events-none">
          +{dialCode}
        </span>
        <input
          type="tel"
          value={localPhone}
          disabled={disabled}
          onChange={(e) => {
            setLocalPhone(e.target.value);
            emit(countryCode, e.target.value);
          }}
          placeholder={placeholder}
          className="w-full border border-brand-950/15 rounded-lg py-2 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 disabled:opacity-50"
          style={{ paddingLeft: `${dialCode.length * 8 + 22}px` }}
        />
      </div>
    </div>
  );
}

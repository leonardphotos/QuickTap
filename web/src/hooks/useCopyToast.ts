import { useCallback, useRef, useState } from 'react';

/** Copia texto al portapapeles y muestra un aviso breve de confirmación. */
export function useCopyToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMessage(null), 2000);
    } catch {
      // El navegador puede negar el permiso de portapapeles; fallamos en silencio.
    }
  }, []);

  return { copy, toastMessage: message };
}

import { useCallback, useRef, useState } from 'react';

/** Aviso flotante breve genérico (ej: "Mensaje enviado") — renderiza junto con <Toast message={toastMessage} />. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, ms = 2200) => {
    setMessage(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), ms);
  }, []);

  return { show, toastMessage: message };
}

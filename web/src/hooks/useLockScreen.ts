import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_LOCK_SCREEN_MINUTES, needsLockScreen } from '@/utils/roles';

export type LockScreenMode = 'setup' | 'unlock';

/**
 * Pantalla de bloqueo: re-solicita el PIN de 4 dígitos del usuario cada N minutos de
 * inactividad (N configurable por rol en Ajustes, ver LockScreenSettingsSection). La "última
 * actividad" vive en localStorage (una clave por usuario, para que un dispositivo compartido
 * entre varios miembros del equipo no mezcle sus tiempos) — así el bloqueo sobrevive un
 * refresh de página en vez de reiniciar el conteo cada vez.
 */
export function useLockScreen() {
  const { user, restaurant } = useAuth();
  // El interruptor de Ajustes manda sobre el rol: apagado, nadie ve el teclado de PIN
  // ni se le exige crear uno. `restaurant` llega en el mismo /auth/me que `user`, así
  // que no hay ventana en la que el rol aplique pero el interruptor todavía no se sepa.
  const applies = needsLockScreen(user?.role) && !!restaurant?.lockScreenEnabled;
  const storageKey = user ? `quicktap_lock_activity_${user.id}` : null;
  const minutes = (user && restaurant?.lockScreenIntervals[user.role]) || DEFAULT_LOCK_SCREEN_MINUTES;

  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  lockedRef.current = locked;

  const touch = useCallback(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, String(Date.now()));
  }, [storageKey]);

  const check = useCallback(() => {
    if (!applies || !storageKey) {
      setLocked(false);
      return;
    }
    const last = Number(localStorage.getItem(storageKey) ?? 0);
    if (!last) {
      touch();
      setLocked(false);
      return;
    }
    setLocked(Date.now() - last > minutes * 60 * 1000);
  }, [applies, storageKey, minutes, touch]);

  useEffect(() => {
    if (!applies) return;
    check();
    const onActivity = () => {
      if (!lockedRef.current) touch();
    };
    const events: (keyof DocumentEventMap)[] = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((e) => document.addEventListener(e, onActivity, { passive: true }));
    const interval = setInterval(check, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.forEach((e) => document.removeEventListener(e, onActivity));
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applies, minutes]);

  function unlock() {
    touch();
    setLocked(false);
  }

  const needsSetup = applies && !!user && !user.hasLockPin;
  const mode: LockScreenMode = needsSetup ? 'setup' : 'unlock';

  return { visible: applies && (needsSetup || locked), mode, unlock };
}

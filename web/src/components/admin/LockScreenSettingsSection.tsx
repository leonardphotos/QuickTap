import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { canManageTeam, DEFAULT_LOCK_SCREEN_MINUTES, LOCK_SCREEN_ROLES, ROLE_LABELS } from '@/utils/roles';

const INTERVAL_OPTIONS = [1, 5, 10] as const;

/**
 * Ajustes → Pantalla de bloqueo. Dos partes en una sola tarjeta:
 * 1. "Tu PIN" — cualquier usuario crea/cambia el suyo (obligatorio, ver useLockScreen/LockScreen).
 * 2. Minutos por rol — solo Dueño/Admin, define cada cuánto se vuelve a pedir el PIN.
 * Se usa tal cual tanto en SettingsPage.tsx (restaurante) como en ShopSettingsPage.tsx (local
 * comercial) — no depende de nada específico de mesas/cocina/ventas.
 */
export function LockScreenSettingsSection() {
  const { user, restaurant, refresh, setLockPin } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const [intervals, setIntervals] = useState<Record<string, number>>(restaurant?.lockScreenIntervals ?? {});
  const [savingIntervals, setSavingIntervals] = useState(false);
  const [intervalsMessage, setIntervalsMessage] = useState<string | null>(null);

  async function savePin() {
    setPinError(null);
    setPinMessage(null);
    if (!/^\d{4}$/.test(pin)) {
      setPinError('El PIN debe tener exactamente 4 dígitos.');
      return;
    }
    if (pin !== confirmPin) {
      setPinError('Los PIN no coinciden.');
      return;
    }
    setSavingPin(true);
    try {
      await setLockPin(pin);
      setPin('');
      setConfirmPin('');
      setPinMessage('PIN guardado.');
    } catch (err: any) {
      setPinError(err.response?.data?.error ?? 'No se pudo guardar el PIN.');
    } finally {
      setSavingPin(false);
    }
  }

  function updateIntervalDraft(role: string, minutes: number) {
    setIntervals((prev) => ({ ...prev, [role]: minutes }));
    setIntervalsMessage(null);
  }

  async function saveIntervals() {
    setSavingIntervals(true);
    setIntervalsMessage(null);
    try {
      await api.patch('/restaurant/lock-screen-intervals', intervals);
      await refresh();
      setIntervalsMessage('Guardado.');
    } finally {
      setSavingIntervals(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Pantalla de bloqueo</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Por seguridad, el panel se bloquea periódicamente y pide un PIN de 4 dígitos para
          seguir — cerrar el navegador no cierra la sesión, solo el botón "Cerrar sesión" lo hace.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-6">
        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-brand-950">
            Tu PIN{' '}
            {user?.hasLockPin ? (
              <span className="text-emerald-600 font-medium">· ya está configurado</span>
            ) : (
              <span className="text-amber-600 font-medium">· obligatorio, aún no lo configuras</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="PIN de 4 dígitos"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
            <input
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="Confirmar PIN"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            />
          </div>
          {pinError && <p className="text-sm text-red-600">{pinError}</p>}
          {pinMessage && <p className="text-sm text-brand-500">{pinMessage}</p>}
          <TextureButton variant="brand" size="default" disabled={savingPin} onClick={savePin} className="!w-auto disabled:opacity-50">
            {savingPin ? 'Guardando…' : user?.hasLockPin ? 'Cambiar mi PIN' : 'Crear mi PIN'}
          </TextureButton>
        </div>

        {canManageTeam(user?.role) && (
          <div className="space-y-2.5 pt-1 border-t border-brand-950/[0.06]">
            <p className="text-sm font-semibold text-brand-950 pt-4">Minutos de inactividad por rol</p>
            <p className="text-xs text-brand-950/50 font-light -mt-1.5">
              Cada rol vuelve a pedir el PIN después de este tiempo sin actividad. No se puede desactivar.
            </p>
            <div className="space-y-2">
              {LOCK_SCREEN_ROLES.map((role) => (
                <div key={role} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-brand-950/80">{ROLE_LABELS[role]}</span>
                  <select
                    value={intervals[role] ?? DEFAULT_LOCK_SCREEN_MINUTES}
                    onChange={(e) => updateIntervalDraft(role, Number(e.target.value))}
                    className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                  >
                    {INTERVAL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {intervalsMessage && <p className="text-sm text-brand-500">{intervalsMessage}</p>}
            <TextureButton
              variant="minimal"
              size="default"
              disabled={savingIntervals}
              onClick={saveIntervals}
              className="!w-auto disabled:opacity-50"
            >
              {savingIntervals ? 'Guardando…' : 'Guardar intervalos'}
            </TextureButton>
          </div>
        )}
      </TextureCardContent>
    </TextureCard>
  );
}

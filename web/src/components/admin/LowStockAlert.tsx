import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Toast } from '@/components/ui/toast';
import { useLowStockItems } from '@/hooks/useLowStockItems';

/** Aviso breve cuando un insumo cruza su stock mínimo (Caja/Administrador/Dueño, y el Mesero
 * al que se le asignó acceso a Inventario). No suena ni bloquea la pantalla — a diferencia de
 * TableServiceAlert/NewOrderAlert, esto no exige atención inmediata, solo informa. */
export function LowStockAlert() {
  const { user } = useAuth();
  const items = useLowStockItems(user?.role, user?.canAccessInventory);
  const [message, setMessage] = useState<string | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));

    // Primera carga: solo memoriza cuáles ya estaban bajos, sin avisar (evita
    // un aviso falso apenas se abre el panel si algo ya venía agotándose).
    if (seenIds.current === null) {
      seenIds.current = ids;
      return;
    }

    const newlyLow = items.filter((i) => !seenIds.current!.has(i.id));
    seenIds.current = ids;
    if (newlyLow.length === 0) return;

    const names = newlyLow.map((i) => i.name).join(', ');
    setMessage(newlyLow.length === 1 ? `Se está agotando: ${names}` : `Se están agotando: ${names}`);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), 6000);
  }, [items]);

  return <Toast message={message} />;
}

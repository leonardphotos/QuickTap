import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { setToken } from '../../api/client';
import AuthLayout from './AuthLayout';

/**
 * Puente para "Entrar sin contraseña" desde el Dashboard maestro: recibe el token ya
 * firmado por vía query string (abierto en pestaña nueva, ver MasterRestaurantDetailPage),
 * lo guarda como sesión de este panel y redirige a /admin — mismo patrón que
 * AuthContext.switchToBranch, recargando la app entera para que el token nuevo
 * quede aplicado desde el primer request.
 */
export default function ImpersonatePage() {
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Falta el token de acceso.');
      return;
    }
    setToken(token);
    window.location.href = '/admin';
  }, [params]);

  return (
    <AuthLayout title="Entrando al panel…">
      <p className="text-center text-sm text-brand-950/60 font-light">
        {error ?? 'Un momento, te estamos llevando al panel del restaurante.'}
      </p>
    </AuthLayout>
  );
}

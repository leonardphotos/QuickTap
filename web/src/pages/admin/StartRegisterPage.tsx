import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { trackFunnel } from '@/utils/registrationFunnel';

/**
 * Mientras la captación pública está enfocada exclusivamente en restaurantes, /empezar
 * conserva la medición del embudo y lleva directo al formulario. Las demás verticales siguen
 * existiendo para las cuentas actuales y se crean únicamente desde el Dashboard Máster.
 */
export default function StartRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();

  useEffect(() => {
    trackFunnel({ stage: 'START', businessType: 'restaurant' });
    const restaurantParams = new URLSearchParams(qs);
    restaurantParams.delete('businessType');
    restaurantParams.delete('rubro');
    if (['SHOP', 'ELITE_SHOP', 'CLUB', 'OFFICE'].includes(restaurantParams.get('plan') ?? '')) {
      restaurantParams.delete('plan');
    }
    const restaurantQuery = restaurantParams.toString();
    navigate(`/admin/register${restaurantQuery ? `?${restaurantQuery}` : ''}`, { replace: true, state: location.state });
  }, [location.state, navigate, qs]);

  return (
    <AuthLayout title="Crea tu restaurante">
      <p className="py-8 text-center font-light text-brand-950/50 text-base">Preparando tu registro…</p>
    </AuthLayout>
  );
}

import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Aviso de "esta sección es de un plan superior". Se muestra en el lugar de la sección
 * cuando hasFeature() dice que no — el servidor igual rechaza la ruta (requireFeature),
 * esto solo explica por qué y lleva a Facturación.
 */
export function PlanUpgradeNotice({
  feature,
  planName,
  onGoToBilling,
}: {
  /** Qué se está intentando ver ("la Contabilidad", "el CRM"). */
  feature: string;
  /** Plan que lo incluye ("Plan Elite", "Elite Shop"). Si no viene, se deduce del vertical. */
  planName?: string;
  /** En Locales, Facturación es una pantalla interna (no una ruta): el padre pasa cómo llegar. */
  onGoToBilling?: () => void;
}) {
  const { restaurant } = useAuth();
  const plan = planName ?? (restaurant?.businessType === 'SHOP' ? 'Elite Shop' : 'Plan Elite');
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
        <Lock className="h-5 w-5" />
      </div>
      <p className="text-[15px] font-semibold text-brand-950">{feature} está disponible en el {plan}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] font-light text-brand-950/55">
        Tu plan actual no incluye esta sección. Mejora tu plan y se activa al instante — sin perder nada de lo que ya
        tienes.
      </p>
      {onGoToBilling ? (
        <TextureButton variant="brand" size="sm" className="mx-auto mt-4 !w-auto" onClick={onGoToBilling}>
          Ver planes
        </TextureButton>
      ) : (
        <Link to="/admin/billing" className="mt-4 inline-block">
          <TextureButton variant="brand" size="sm" className="!w-auto">
            Ver planes
          </TextureButton>
        </Link>
      )}
    </div>
  );
}

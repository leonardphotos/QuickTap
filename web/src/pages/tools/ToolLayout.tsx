import type { ReactNode } from 'react';
import { SeoPageLayout } from '@/pages/seo/SeoPageLayout';
import { trackToolEvent } from '@/utils/tools/analytics';

/** Marco reutilizable para costo por plato, margen y punto de equilibrio. */
export function ToolLayout({ children }: { children: ReactNode }) {
  return <div className="public-tool"><SeoPageLayout showClosingCta={false} onTrialStart={() => trackToolEvent('trial_start')}>{children}</SeoPageLayout></div>;
}

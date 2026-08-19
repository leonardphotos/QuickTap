import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  /** Opcional: el login no lleva título porque el logo completo ya dice dónde estás. */
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Fondo blanco, sin tarjeta/borde: el logo, los títulos y los campos
 * "flotan" directamente sobre la página, con espacio generoso arriba
 * para que el logo quede centrado por completo.
 */
export default function AuthLayout({ title, children, footer }: Props) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-6 pt-20 pb-16 sm:pt-28">
      <Link to="/" className="mb-10">
        <img src="/logo/logo-central.png" alt="QuickTap" className="h-12 w-auto mx-auto" />
      </Link>

      <div className="w-full max-w-sm">
        {title && <h1 className="text-2xl font-semibold text-brand-950 text-center mb-8">{title}</h1>}
        {children}
        {footer && <div className="mt-6 text-center">{footer}</div>}
      </div>
    </div>
  );
}

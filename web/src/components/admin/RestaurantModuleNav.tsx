import { useLocation } from 'react-router-dom';
import { MorphingNav } from '@/components/ui/morphing-nav';
import type { AdminNavLink } from '@/pages/admin/nav-links';

const groups = [
  { label: 'Productos', paths: ['/admin/products', '/admin/internal-menu'], labels: ['Catálogo', 'Menú interno'] },
];

/** Agrupa destinos visibles, sin ampliar permisos ni romper enlaces guardados. */
export function primaryRestaurantLinks(links: AdminNavLink[]): AdminNavLink[] {
  return links.flatMap((link) => {
    const group = groups.find((item) => item.paths.includes(link.to));
    if (!group) return [link];
    const first = links.find((item) => group.paths.includes(item.to));
    return first?.to === link.to ? [{ ...link, label: group.label }] : [];
  });
}

export function restaurantLinkActive(to: string, pathname: string) {
  const group = groups.find((item) => item.paths.includes(to));
  return (group?.paths ?? [to]).some((path) => pathname === path || (path !== '/admin' && pathname.startsWith(`${path}/`)));
}

export function RestaurantModuleNav({ links }: { links: AdminNavLink[] }) {
  const { pathname } = useLocation();
  const group = groups.find((item) => item.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`)));
  if (!group) return null;
  const visible = group.paths.filter((path) => links.some((link) => link.to === path));
  if (visible.length < 2) return null;
  return <MorphingNav label={`Vistas de ${group.label}`} items={visible.map(path => ({ href: path,
    label: group.labels[group.paths.indexOf(path)], active: pathname === path || pathname.startsWith(`${path}/`),
  }))} />;
}

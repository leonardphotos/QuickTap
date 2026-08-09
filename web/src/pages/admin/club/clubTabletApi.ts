import { api } from '@/api/client';

/**
 * La tablet de la cancha. Inicia sesión una vez con su propio usuario (rol
 * CANCHA) y se queda abierta: lo que identifica al jugador en cada uso es el QR
 * de su reserva, que se manda en cada llamada.
 */

export type TabletItemSource = 'CLUB_STORE' | 'RESTAURANT';

export interface TabletCatalogItem {
  source: TabletItemSource;
  id: string;
  name: string;
  category: string;
  priceBase: string;
  photoUrl: string | null;
  /** Solo para la tienda del club; el menú del restaurante no lleva stock acá. */
  stock: number | null;
}

export interface TabletSession {
  booking: {
    id: string;
    accessToken: string;
    playerName: string;
    playerCount: number;
    courtName: string;
    startsAt: string;
    endsAt: string;
    remainingMinutes: number;
    finished: boolean;
  };
  money: {
    courtBase: string;
    consumoBase: string;
    dueBase: string;
    paidBase: string;
    balanceBase: string;
    exchangeRate: string;
  };
  orders: {
    id: string;
    status: string;
    totalBase: string;
    createdAt: string;
    items: { productName: string; quantity: number; lineTotal: string }[];
  }[];
}

export const clubTabletApi = {
  session: (accessToken: string) =>
    api.get<{ data: TabletSession }>(`/club-tablet/session/${accessToken}`).then((r) => r.data.data),
  catalog: () =>
    api
      .get<{ data: { kitchen: { id: string; name: string; logoUrl: string | null } | null; items: TabletCatalogItem[] } }>(
        '/club-tablet/catalog',
      )
      .then((r) => r.data.data),
  createOrder: (accessToken: string, items: { source: TabletItemSource; productId: string; quantity: number }[]) =>
    api
      .post<{ data: { id: string; totalBase: string; totalBs: string } }>('/club-tablet/orders', { accessToken, items })
      .then((r) => r.data.data),
};

import { api } from './client';

/**
 * Puente club ↔ restaurante. Los dos lados hablan con el mismo módulo del
 * backend (/club-link): el restaurante genera el código y ve la cola de
 * comandas, el club canjea el código.
 */

export type ClubTabOrderStatus = 'PENDING' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';

export interface LinkedParty {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface RestaurantLinkState {
  activeCode: { code: string; expiresAt: string } | null;
  clubs: (LinkedParty & { linkedAt: string })[];
}

/** Una comanda de cancha vista desde el restaurante que la prepara. */
export interface KitchenClubOrder {
  id: string;
  /** El nombre de la cancha hace de "mesa": es a dónde hay que llevar los productos. */
  courtName: string;
  status: ClubTabOrderStatus;
  totalBase: string;
  totalBs: string;
  createdAt: string;
  deliveredAt: string | null;
  club: { id: string; name: string };
  player: { name: string; phone: string; count: number; startsAt: string; endsAt: string };
  items: { id: string; productName: string; quantity: number; unitPrice: string }[];
  /** Líneas que despacha el propio club desde su tienda (agua, pelotas): no las prepara el restaurante. */
  clubItemCount: number;
}

export const clubLinkApi = {
  // Lado restaurante
  state: () => api.get<{ data: RestaurantLinkState }>('/club-link/state').then((r) => r.data.data),
  createCode: () =>
    api.post<{ data: { code: string; expiresAt: string } }>('/club-link/code').then((r) => r.data.data),
  unlinkClub: (clubId: string) => api.delete(`/club-link/clubs/${clubId}`).then((r) => r.data),
  orders: (includeDelivered = false) =>
    api
      .get<{ data: KitchenClubOrder[] }>('/club-link/orders', { params: { includeDelivered } })
      .then((r) => r.data.data),
  setOrderStatus: (id: string, status: 'PREPARING' | 'DELIVERED' | 'CANCELLED') =>
    api.patch<{ data: { id: string; status: ClubTabOrderStatus } }>(`/club-link/orders/${id}/status`, { status }).then((r) => r.data.data),

  // Lado club
  clubState: () =>
    api
      .get<{ data: { stores: (LinkedParty & { linkedAt: string })[]; maxStores: number } }>('/club-link/club')
      .then((r) => r.data.data),
  redeem: (code: string) =>
    api.post<{ data: { restaurant: LinkedParty } }>('/club-link/redeem', { code }).then((r) => r.data.data),
  /** Desvincula UNA tienda: un club puede tener varias. */
  unlinkFromClub: (restaurantId: string) => api.delete(`/club-link/club/${restaurantId}`).then((r) => r.data),
};

import { api } from '@/api/client';

/**
 * La tablet de la cancha. Inicia sesión una vez con su propio usuario (rol
 * CANCHA) y se queda abierta: lo que identifica al jugador en cada uso es el QR
 * de su reserva, que se manda en cada llamada.
 */

export type TabletItemSource = 'CLUB_STORE' | 'RESTAURANT';

/** La cancha donde está montada esta tablet. Null si quien entró no es una
 * tablet de cancha (dueño/admin probando la pantalla desde el panel). */
export interface TabletCourt {
  id: string;
  name: string;
  courtType: 'LIBRE' | 'TECHADA' | 'INDOOR';
}

export interface TabletCatalogItem {
  source: TabletItemSource;
  /** 'CLUB' para la tienda propia del club, o el id de una tienda vinculada. */
  storeId: string;
  id: string;
  name: string;
  category: string;
  priceBase: string;
  photoUrl: string | null;
  /** Solo para la tienda del club; el menú del restaurante no lleva stock acá. */
  stock: number | null;
}

/** Una tienda de la tablet: la propia del club o una vinculada. Cada una es un
 *  icono en pantalla y una comanda aparte. */
export interface TabletStore {
  id: string;
  name: string;
  logoUrl: string | null;
  items: TabletCatalogItem[];
}

/** Id de la tienda propia del club (espejo de CLUB_STORE_ID en el backend). */
export const CLUB_STORE_ID = 'CLUB';

/** Cómo pagarle a un cobrador. Los campos son los de Ajustes → Métodos de pago. */
export interface TabletPayMethod {
  method: string;
  /** Nombre con que el negocio distingue esta cuenta ("Zelle Chase") cuando tiene varias. */
  label?: string;
  banco?: string;
  telefono?: string;
  cedula?: string;
  titular?: string;
  correo?: string;
  cuenta?: string;
  rif?: string;
  qrImageUrl?: string;
}

/**
 * Una cuenta a pagar. Hay una del club (cancha + su tienda) y una por cada
 * tienda vinculada a la que se le pidió algo: cada una cobra lo suyo, con su
 * propio método de pago.
 */
export interface TabletTabItem {
  name: string;
  quantity: number;
  lineTotalBase: string;
}

export interface TabletTab {
  payeeId: string;
  name: string;
  logoUrl: string | null;
  detail: string;
  dueBase: string;
  paidBase: string;
  balanceBase: string;
  /** El saldo en bolívares, a la tasa congelada de la reserva. */
  balanceBs: string;
  items: TabletTabItem[];
  methods: TabletPayMethod[];
  /** Ya reportado y esperando que el cobrador lo confirme. */
  pendingBase: string;
}

export interface TabletSession {
  tabs: TabletTab[];
  booking: {
    id: string;
    accessToken: string;
    playerName: string;
    playerCount: number;
    // Si el jugador confirmó al reservar que iban a jugar un Americano/Mexicano,
    // acá llegan los nombres para prellenar el torneo en esta tablet.
    tournamentPlayerNames: string[] | null;
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

/** Una cancha vista con la llave maestra, con su reserva en curso si la tiene. */
export interface MasterCourt {
  id: string;
  name: string;
  booking: {
    accessToken: string;
    playerName: string;
    playerCount: number;
    startsAt: string;
    endsAt: string;
  } | null;
}

export const clubTabletApi = {
  court: () => api.get<{ data: TabletCourt | null }>('/club-tablet/court').then((r) => r.data.data),
  /** Con `masterCode` abre la reserva aunque sea de otra cancha o esté fuera de hora. */
  session: (accessToken: string, masterCode?: string) =>
    api
      .get<{ data: TabletSession }>(`/club-tablet/session/${accessToken}`, {
        params: masterCode ? { master: masterCode } : undefined,
      })
      .then((r) => r.data.data),
  /** Canjea la llave maestra por la lista de canchas con su reserva en curso. */
  master: (code: string) =>
    api.post<{ data: { courts: MasterCourt[] } }>('/club-tablet/master', { code }).then((r) => r.data.data.courts),
  catalog: () =>
    api.get<{ data: { stores: TabletStore[] } }>('/club-tablet/catalog').then((r) => r.data.data.stores),
  /** Un pedido es siempre de UNA tienda: así cada una cobra lo suyo. */
  createOrder: (accessToken: string, storeId: string, items: { productId: string; quantity: number }[]) =>
    api
      .post<{ data: { id: string; totalBase: string; totalBs: string } }>('/club-tablet/orders', {
        accessToken,
        storeId,
        items,
      })
      .then((r) => r.data.data),
  /** El jugador reporta que ya transfirió. No cobra: deja el pago por aprobar. */
  reportPayment: (body: {
    accessToken: string;
    payeeId: string;
    amountBase: number;
    method: string;
    referenceNumber?: string | null;
  }) =>
    api
      .post<{ data: { id: string; amountBase: string; amountBs: string } }>('/club-tablet/payments', body)
      .then((r) => r.data.data),
};

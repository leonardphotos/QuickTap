import { timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { DEMO_LIVE_TOKENS, DEMO_MATCH_MINUTES, refreshClubDemo } from '../../utils/club-demo';
import { round2, toDecimal } from '../../utils/money';
import { effectiveProductPrice } from '../../utils/promo-price';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { clubLinkService } from '../club-link/club-link.service';
import { emitToKitchen, SocketEvents } from '../../sockets';
import type { CreateTabOrderInput, ReportTabPaymentInput } from './club-tablet.dto';

/**
 * Ventana en la que el QR de una reserva abre la tablet. Antes de empezar se
 * permite entrar un rato (el jugador llega temprano y ya quiere pedir); después
 * de terminar se sigue permitiendo un rato más, que es justo cuando la tablet
 * tiene que mostrar el total y mandarlo a caja.
 */
const OPEN_BEFORE_MINUTES = 30;
const OPEN_AFTER_MINUTES = 60;

/**
 * Id de la tienda propia del club en el catálogo de la tablet. No es el id del
 * club a propósito: en `ClubTabOrder.kitchenRestaurantId` esa tienda se guarda
 * como `null` ("no hay tienda externa que prepare esto"), y usar un centinela
 * evita confundirla con una tienda vinculada que casualmente fuera el club.
 */
const CLUB_STORE_ID = 'CLUB';

/**
 * Llave maestra de las tablets. Se escribe en la misma casilla que el código de
 * la reserva y abre cualquier cancha sin el QR del jugador — para cuando el QR
 * no escanea, se perdió, o recepción necesita entrar a una tablet que no es la
 * de esa cancha.
 *
 * Vive en la configuración del servidor (CLUB_TABLET_MASTER_CODE) y NO en el
 * código: así no queda en el repositorio y se puede cambiar sin desplegar. Si no
 * está configurada, la llave maestra simplemente no existe.
 *
 * No es una puerta desde fuera: todas las rutas de este módulo exigen sesión
 * iniciada del club (tenantGuard + rol), así que la llave es una SEGUNDA
 * credencial sobre una tablet que ya está dentro, nunca la primera.
 */
function isMasterCode(candidate: string | undefined | null): boolean {
  const expected = process.env.CLUB_TABLET_MASTER_CODE?.trim();
  if (!expected || !candidate) return false;

  const a = Buffer.from(candidate.trim());
  const b = Buffer.from(expected);
  // Comparación de tiempo constante: comparar con === deja medir cuántos
  // caracteres acertó quien esté probando códigos.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Una línea del catálogo, venga de la tienda del club o de una vinculada. Las
 *  dos comparten forma para que la tablet las pinte con el mismo componente. */
interface CatalogItem {
  source: 'CLUB_STORE' | 'RESTAURANT';
  storeId: string;
  id: string;
  name: string;
  category: string;
  priceBase: string;
  photoUrl: string | null;
  /** Solo la tienda del club lleva stock; el menú de un restaurante no. */
  stock: number | null;
}

/**
 * Lo consumido en la reserva que COBRA EL CLUB: su tienda propia
 * (`kitchenRestaurantId === null`). Lo pedido a una tienda vinculada es cuenta
 * de esa tienda y se devuelve aparte, en `tabs`.
 */
function consumoOf(
  tabOrders: { totalBase: Prisma.Decimal; status: string; kitchenRestaurantId: string | null }[],
): Prisma.Decimal {
  return round2(
    tabOrders
      .filter((o) => o.status !== 'CANCELLED' && o.kitchenRestaurantId === null)
      .reduce((acc, o) => acc.add(o.totalBase), toDecimal(0)),
  );
}

/** La cancha a la que está atornillada esta tablet. Dueño/Admin/Cajero entran sin
 * cancha asignada (prueban la pantalla desde el panel) y no se les filtra. */
async function tabletCourtIdOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, clubCourtId: true } });
  return user?.role === 'CANCHA' ? user.clubCourtId : null;
}

/**
 * Lo que vende una tienda vinculada, ya normalizado. Un restaurante vende de su
 * Menú (`Product`, con precio de promo vigente) y un local de su Tienda
 * (`ShopProduct`, con existencia real). Sin esta bifurcación, vincular un local
 * mostraba una tienda vacía y nadie entendía por qué.
 */
async function readStoreCatalog(store: { id: string }) {
  const info = await prisma.restaurant.findUniqueOrThrow({
    where: { id: store.id },
    select: { businessType: true },
  });

  if (info.businessType === 'SHOP') {
    const products = await prisma.shopProduct.findMany({
      where: { restaurantId: store.id },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { variants: true },
    });
    return products
      .filter((p) => p.variants.reduce((acc, v) => acc + v.stock, 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || 'Tienda',
        priceBase: p.price.toFixed(2),
        photoUrl: p.photoUrl,
      }));
  }

  const now = new Date();
  const menu = await prisma.product.findMany({
    where: { restaurantId: store.id, isAvailable: true, category: { isActive: true } },
    orderBy: [{ category: { priority: 'asc' } }, { name: 'asc' }],
    include: { category: { select: { name: true } } },
  });
  return menu
    .filter((p) => !(p.stockControlEnabled && (p.stockQuantity ?? 0) <= 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? 'Menú',
      priceBase: effectiveProductPrice(p, now).toFixed(2),
      photoUrl: p.photoUrl,
    }));
}

/** Una línea del desglose de una cuenta: qué se está pagando. */
interface TabItem {
  name: string;
  quantity: number;
  lineTotalBase: string;
}

/** Los datos que el jugador necesita para pagarle a alguien. */
interface PayMethod {
  method: string;
  banco?: string;
  telefono?: string;
  cedula?: string;
  titular?: string;
  correo?: string;
  cuenta?: string;
  rif?: string;
  qrImageUrl?: string;
}

/** Solo estos campos salen del `paymentMethodsConfig` del cobrador. Se listan a
 *  mano en vez de reenviar el objeto entero: es config de otro tenant y no todo
 *  lo que haya ahí adentro tiene por qué verse en una tablet pública. */
const PAY_FIELDS = ['banco', 'telefono', 'cedula', 'titular', 'correo', 'cuenta', 'rif', 'qrImageUrl'] as const;

/**
 * Cómo se le paga a un cobrador (el club o una tienda vinculada). Devuelve solo
 * los métodos HABILITADOS: uno apagado en sus Ajustes no debe ofrecerse en la
 * cancha.
 */
function payMethodsOf(config: unknown): PayMethod[] {
  if (!config || typeof config !== 'object') return [];
  return Object.entries(config as Record<string, Record<string, unknown>>)
    .filter(([, v]) => v && typeof v === 'object' && v.enabled === true)
    .map(([method, v]) => {
      const out: PayMethod = { method };
      for (const f of PAY_FIELDS) {
        const value = v[f];
        if (typeof value === 'string' && value.trim()) out[f] = value;
      }
      return out;
    });
}

/**
 * Las cuentas a pagar de una reserva, una por cobrador.
 *
 * La primera es siempre la del club (cancha + su tienda propia); después va una
 * por cada tienda vinculada a la que se le pidió algo. Cada una lleva su propio
 * método de cobro: el jugador le paga a cada quien por su lado, no todo junto
 * en la caja del club.
 */
async function buildTabs(
  clubId: string,
  booking: {
    id: string;
    totalBase: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    tabOrders: {
      totalBase: Prisma.Decimal;
      status: string;
      kitchenRestaurantId: string | null;
      items: { productName: string; quantity: number; lineTotal: Prisma.Decimal }[];
    }[];
  },
  clubDueBase: Prisma.Decimal,
  clubPaidBase: Prisma.Decimal,
) {
  const live = booking.tabOrders.filter((o) => o.status !== 'CANCELLED');
  const rate = booking.exchangeRate;

  // Cuánto le debe a cada tienda vinculada, y qué le pidió.
  const byStore = new Map<string, { total: Prisma.Decimal; items: TabItem[] }>();
  const clubItems: TabItem[] = [];
  for (const o of live) {
    const lines = o.items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      lineTotalBase: i.lineTotal.toFixed(2),
    }));
    if (!o.kitchenRestaurantId) {
      clubItems.push(...lines);
      continue;
    }
    const prev = byStore.get(o.kitchenRestaurantId) ?? { total: toDecimal(0), items: [] };
    byStore.set(o.kitchenRestaurantId, { total: prev.total.add(o.totalBase), items: [...prev.items, ...lines] });
  }

  const [club, storeRows, reported] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({
      where: { id: clubId },
      select: { name: true, logoUrl: true, paymentMethodsConfig: true },
    }),
    byStore.size
      ? prisma.restaurant.findMany({
          where: { id: { in: [...byStore.keys()] } },
          select: { id: true, name: true, logoUrl: true, paymentMethodsConfig: true },
        })
      : Promise.resolve([]),
    prisma.clubReportedPayment.findMany({
      where: { bookingId: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { payeeRestaurantId: true, amountBase: true, status: true },
    }),
  ]);

  /** Lo reportado por el jugador para un cobrador, separado por si ya se aprobó. */
  function reportedFor(payeeId: string | null) {
    const mine = reported.filter((r) => (r.payeeRestaurantId ?? null) === payeeId);
    const sum = (st: string) =>
      round2(mine.filter((r) => r.status === st).reduce((acc, r) => acc.add(r.amountBase), toDecimal(0)));
    return { pendingBase: sum('PENDING'), confirmedBase: sum('CONFIRMED') };
  }

  const clubReported = reportedFor(null);
  // Los pagos al club aprobados ya son ClubBookingPayment (entran en clubPaidBase),
  // así que acá solo se descuenta lo que todavía está por verificar.
  const clubBalance = round2(Prisma.Decimal.max(0, clubDueBase.sub(clubPaidBase)));

  const courtLine: TabItem = {
    name: 'Alquiler de cancha',
    quantity: 1,
    lineTotalBase: booking.totalBase.toFixed(2),
  };

  return [
    {
      payeeId: CLUB_STORE_ID,
      name: club.name,
      logoUrl: club.logoUrl,
      /** Qué incluye esta cuenta, para que el jugador entienda qué está pagando. */
      detail: 'Cancha y tienda del club',
      dueBase: clubDueBase.toFixed(2),
      paidBase: clubPaidBase.toFixed(2),
      balanceBase: clubBalance.toFixed(2),
      balanceBs: round2(clubBalance.mul(rate)).toFixed(2),
      items: [courtLine, ...clubItems],
      methods: payMethodsOf(club.paymentMethodsConfig),
      pendingBase: clubReported.pendingBase.toFixed(2),
    },
    ...storeRows.map((s) => {
      const agg = byStore.get(s.id)!;
      const due = round2(agg.total);
      const r = reportedFor(s.id);
      // A una tienda no se le registran ClubBookingPayment: lo que salda su
      // cuenta es lo que ella misma aprobó de los pagos reportados.
      const balance = round2(Prisma.Decimal.max(0, due.sub(r.confirmedBase)));
      return {
        payeeId: s.id,
        name: s.name,
        logoUrl: s.logoUrl,
        detail: 'Lo que pediste a esta tienda',
        dueBase: due.toFixed(2),
        paidBase: r.confirmedBase.toFixed(2),
        balanceBase: balance.toFixed(2),
        balanceBs: round2(balance.mul(rate)).toFixed(2),
        items: agg.items,
        methods: payMethodsOf(s.paymentMethodsConfig),
        pendingBase: r.pendingBase.toFixed(2),
      };
    }),
  ].filter((t) => Number(t.dueBase) > 0);
}

async function loadSession(clubId: string, accessToken: string) {
  const booking = await prisma.clubBooking.findUnique({
    where: { accessToken },
    include: {
      block: { include: { court: { select: { id: true, name: true } } } },
      payments: { select: { amountBase: true } },
      tabOrders: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      },
    },
  });

  // Mismo criterio que el check-in de recepción: un token de otro club no existe
  // para este tenant.
  if (!booking || booking.restaurantId !== clubId) throw notFound('Esta reserva no existe.');
  if (booking.status === 'CANCELLED') throw badRequest('Esta reserva fue cancelada.');

  return booking;
}

export const clubTabletService = {
  /**
   * Abre la sesión de la tablet a partir del QR del jugador. Devuelve todo lo
   * que la pantalla necesita: a quién saludar, cuánto tiempo queda y qué lleva
   * consumido.
   */
  async getSession(clubId: string, userId: string, accessToken: string, masterCode?: string) {
    // La demo desliza sus reservas en vivo para que el QR nunca caduque; si no se
    // refrescara acá, escanear en la tablet sin haber abierto antes el panel
    // devolvería "esta reserva ya terminó". Con un token de demo se fuerza,
    // saltándose el throttle: escanear justo dentro de esa ventana no puede
    // devolver un error.
    await refreshClubDemo(clubId, DEMO_LIVE_TOKENS.includes(accessToken));
    let booking = await loadSession(clubId, accessToken);

    // En el club demo, una reserva creada desde el enlace público abre la
    // tablet A CUALQUIER HORA: al primer escaneo (o si su horario ya quedó
    // atrás) la partida se re-ancla para empezar en este instante y durar
    // DEMO_MATCH_MINUTES — así quien mira la demostración ve arrancar el
    // cronómetro y, un minuto después, la pantalla de cierre. Los refrescos
    // periódicos de la tablet caen dentro de la ventana y NO re-anclan, o la
    // partida no terminaría nunca. Las reservas "en vivo" (DEMO_LIVE_TOKENS)
    // quedan fuera: esas deben mostrar una partida larga en curso.
    if (!DEMO_LIVE_TOKENS.includes(accessToken)) {
      const demo = await prisma.restaurant.findUnique({ where: { id: clubId }, select: { isDemo: true } });
      if (demo?.isDemo) {
        const nowMs = Date.now();
        const outOfWindow =
          nowMs < booking.block.startsAt.getTime() - OPEN_BEFORE_MINUTES * 60_000 ||
          nowMs > booking.block.endsAt.getTime() + OPEN_AFTER_MINUTES * 60_000;
        if (!booking.checkedInAt || outOfWindow) {
          const newStart = new Date(nowMs);
          const newEnd = new Date(nowMs + DEMO_MATCH_MINUTES * 60_000);
          await prisma.$transaction([
            // Igual que refreshClubDemo: lo que estorbe en esa cancha se cancela
            // antes de mover el bloque, o la restricción EXCLUDE lo rechaza.
            prisma.clubCourtBlock.updateMany({
              where: {
                restaurantId: clubId,
                courtId: booking.block.courtId,
                id: { not: booking.blockId },
                status: 'ACTIVE',
                startsAt: { lt: newEnd },
                endsAt: { gt: newStart },
              },
              data: { status: 'CANCELLED' },
            }),
            prisma.clubCourtBlock.update({
              where: { id: booking.blockId },
              data: { startsAt: newStart, endsAt: newEnd, status: 'ACTIVE' },
            }),
            prisma.clubBooking.update({
              where: { id: booking.id },
              data: { status: 'CONFIRMED', checkedInAt: newStart },
            }),
          ]);
          booking = await loadSession(clubId, accessToken);
          emitToKitchen(clubId, SocketEvents.CLUB_BOOKING_UPDATED, { id: booking.id });
        }
      }
    }

    // Con la llave maestra se abre cualquier reserva desde cualquier tablet, y a
    // cualquier hora: es precisamente para destrabar los casos que los dos
    // candados de abajo bloquean.
    const master = isMasterCode(masterCode);

    // La tablet de la Cancha 2 no abre el QR de una reserva de la Cancha 1: el
    // jugador se llevaría los pedidos a la cancha equivocada.
    const tabletCourtId = master ? null : await tabletCourtIdOf(userId);
    if (tabletCourtId && booking.block.courtId !== tabletCourtId) {
      const own = await prisma.clubCourt.findUnique({ where: { id: tabletCourtId }, select: { name: true } });
      throw badRequest(
        `Esta reserva es de ${booking.block.court.name}. Esta tablet es de ${own?.name ?? 'otra cancha'}.`,
      );
    }

    const now = Date.now();
    const startsAt = booking.block.startsAt.getTime();
    const endsAt = booking.block.endsAt.getTime();
    if (!master && now < startsAt - OPEN_BEFORE_MINUTES * 60_000) {
      throw badRequest('Tu reserva todavía no empieza. Vuelve unos minutos antes de tu hora.');
    }
    if (!master && now > endsAt + OPEN_AFTER_MINUTES * 60_000) {
      throw badRequest('Esta reserva ya terminó. Acércate a caja si tienes algo pendiente.');
    }

    const consumoBase = consumoOf(booking.tabOrders);
    const paidBase = round2(booking.payments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)));
    const dueBase = round2(booking.totalBase.add(consumoBase));

    // Una cuenta por cobrador. El club cobra la cancha + su tienda propia; cada
    // tienda vinculada cobra lo suyo, con SU método de pago — por eso cada
    // cuenta viaja con el suyo y no con el del club.
    const tabs = await buildTabs(clubId, booking, dueBase, paidBase);

    return {
      tabs,
      booking: {
        id: booking.id,
        accessToken: booking.accessToken,
        playerName: booking.playerName,
        playerCount: booking.playerCount,
        // Para prellenar el torneo desde esta pantalla si el jugador ya confirmó
        // los nombres al reservar (ver createBookingSchema.tournamentPlayerNames).
        tournamentPlayerNames: (booking.tournamentPlayerNames as string[] | null) ?? null,
        courtName: booking.block.court.name,
        startsAt: booking.block.startsAt,
        endsAt: booking.block.endsAt,
        remainingMinutes: Math.max(0, Math.round((endsAt - now) / 60_000)),
        finished: now >= endsAt,
      },
      money: {
        courtBase: booking.totalBase.toFixed(2),
        consumoBase: consumoBase.toFixed(2),
        dueBase: dueBase.toFixed(2),
        paidBase: paidBase.toFixed(2),
        balanceBase: round2(Prisma.Decimal.max(0, dueBase.sub(paidBase))).toFixed(2),
        exchangeRate: booking.exchangeRate.toFixed(4),
      },
      orders: booking.tabOrders.map((o) => ({
        id: o.id,
        status: o.status,
        totalBase: o.totalBase.toFixed(2),
        createdAt: o.createdAt,
        items: o.items.map((i) => ({ productName: i.productName, quantity: i.quantity, lineTotal: i.lineTotal.toFixed(2) })),
      })),
    };
  },

  /**
   * La cancha donde está montada esta tablet, para la portada de inicio.
   * Dueño/Admin/Cajero entran sin cancha asignada (prueban la pantalla desde el
   * panel) y reciben null: la portada cae al nombre del club.
   */
  async getOwnCourt(clubId: string, userId: string) {
    const courtId = await tabletCourtIdOf(userId);
    if (!courtId) return null;
    return prisma.clubCourt.findFirst({
      where: { id: courtId, restaurantId: clubId },
      select: { id: true, name: true, courtType: true },
    });
  },

  /**
   * Catálogo que ve el jugador, AGRUPADO POR TIENDA: primero la tienda propia
   * del club, después cada tienda vinculada (hasta 4). Cada una es un icono en
   * la tablet y una cuenta aparte.
   *
   * La lectura a los otros tenants está autorizada por el vínculo
   * (ClubRestaurantLink), que es lo único que la habilita.
   */
  async getCatalog(clubId: string) {
    const [club, kitchens] = await Promise.all([
      prisma.restaurant.findUniqueOrThrow({ where: { id: clubId }, select: { name: true, logoUrl: true } }),
      clubLinkService.resolveKitchensFor(clubId),
    ]);

    const [shopProducts, storeCatalogs] = await Promise.all([
      prisma.shopProduct.findMany({
        where: { restaurantId: clubId },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        include: { variants: true },
      }),
      // Una tienda vinculada puede ser un restaurante (vende de su Menú) o un
      // local (vende de su Tienda). Se lee lo que corresponda, si no una tienda
      // recién vinculada aparecería vacía sin explicación.
      Promise.all(kitchens.map((k) => readStoreCatalog(k))),
    ]);

    const clubItems: CatalogItem[] = shopProducts
      .map((p) => {
        const stock = p.variants.reduce((acc, v) => acc + v.stock, 0);
        return {
          source: 'CLUB_STORE' as const,
          storeId: CLUB_STORE_ID,
          id: p.id,
          name: p.name,
          category: p.category || 'Tienda',
          priceBase: p.price.toFixed(2),
          photoUrl: p.photoUrl,
          stock,
        };
      })
      .filter((p) => (p.stock ?? 0) > 0);

    const stores: { id: string; name: string; logoUrl: string | null; items: CatalogItem[] }[] = [
      // La tienda del club va primero y siempre existe, aunque esté vacía: es la
      // que despacha agua y pelotas sin depender de nadie.
      {
        id: CLUB_STORE_ID,
        name: 'Tienda del club',
        logoUrl: club.logoUrl,
        items: clubItems,
      },
      ...kitchens.map((k, i) => ({
        id: k.id,
        name: k.name,
        logoUrl: k.logoUrl,
        items: storeCatalogs[i].map((p) => ({
          // 'RESTAURANT' acá significa "de una tienda vinculada", sea restaurante
          // o local: es lo que separa esas líneas de las de la tienda del club.
          source: 'RESTAURANT' as const,
          storeId: k.id,
          id: p.id,
          name: p.name,
          category: p.category,
          priceBase: p.priceBase,
          photoUrl: p.photoUrl,
          stock: null as number | null,
        })),
      })),
    ].filter((s) => s.items.length > 0);

    return { stores };
  },

  /**
   * El jugador manda su pedido desde la cancha. Una comanda es SIEMPRE de una
   * sola tienda (`input.storeId`): así cada una cobra lo suyo y recibe solo lo
   * que ella prepara. Los precios se resuelven acá (nunca se confía en el
   * cliente) y el total se congela, igual que en Order.
   */
  async createOrder(clubId: string, userId: string, input: CreateTabOrderInput) {
    const booking = await loadSession(clubId, input.accessToken);

    const tabletCourtId = await tabletCourtIdOf(userId);
    if (tabletCourtId && booking.block.courtId !== tabletCourtId) {
      throw badRequest('Esta reserva no es de esta cancha.');
    }

    if (Date.now() > booking.block.endsAt.getTime()) {
      throw badRequest('Tu tiempo de cancha terminó. Pasa por caja para cerrar tu cuenta.');
    }

    const isClubStore = input.storeId === CLUB_STORE_ID;
    // La tienda tiene que estar vinculada AHORA. Es lo que autoriza a leerle los
    // productos y a mandarle la comanda; sin esta comprobación un storeId
    // inventado por el cliente alcanzaría para pedirle a cualquier tenant.
    const kitchen = isClubStore
      ? null
      : (await clubLinkService.resolveKitchensFor(clubId)).find((k) => k.id === input.storeId) ?? null;
    if (!isClubStore && !kitchen) {
      throw badRequest('Esa tienda ya no está vinculada a este club.');
    }

    const productIds = input.items.map((i) => i.productId);

    const [shopProducts, storeCatalog] = await Promise.all([
      isClubStore
        ? prisma.shopProduct.findMany({ where: { id: { in: productIds }, restaurantId: clubId }, include: { variants: true } })
        : Promise.resolve([]),
      // Se valida contra el MISMO catálogo que se le mostró al jugador, así el
      // precio cobrado es exactamente el que vio (y un producto retirado del
      // menú deja de poder pedirse aunque el cliente mande su id).
      kitchen ? readStoreCatalog(kitchen) : Promise.resolve([]),
    ]);

    const lines: Prisma.ClubTabItemCreateWithoutOrderInput[] = [];
    // Varias líneas del mismo producto de tienda tienen que descontar stock
    // sumado, no cada una por su lado.
    const stockToDrop = new Map<string, { variantV1: string; quantity: number }>();

    for (const item of input.items) {
      if (isClubStore) {
        const product = shopProducts.find((p) => p.id === item.productId);
        if (!product) throw badRequest('Uno de los productos ya no está disponible.');
        const variant = product.variants[0];
        if (!variant) throw badRequest(`"${product.name}" no tiene stock configurado.`);

        const prev = stockToDrop.get(product.id);
        const wanted = (prev?.quantity ?? 0) + item.quantity;
        if (wanted > variant.stock) throw badRequest(`No queda suficiente stock de "${product.name}".`);
        stockToDrop.set(product.id, { variantV1: variant.v1, quantity: wanted });

        const unitPrice = round2(product.price);
        lines.push({
          source: 'CLUB_STORE',
          sourceProductId: product.id,
          variantV1: variant.v1,
          productName: product.name,
          unitPrice,
          quantity: item.quantity,
          lineTotal: round2(unitPrice.mul(item.quantity)),
        });
      } else {
        const product = storeCatalog.find((p) => p.id === item.productId);
        if (!product) throw badRequest('Uno de los productos ya no está disponible.');
        const unitPrice = round2(toDecimal(product.priceBase));
        lines.push({
          source: 'RESTAURANT',
          sourceProductId: product.id,
          productName: product.name,
          unitPrice,
          quantity: item.quantity,
          lineTotal: round2(unitPrice.mul(item.quantity)),
        });
      }
    }

    const totalBase = round2(lines.reduce((acc, l) => acc.add(l.lineTotal as Prisma.Decimal), toDecimal(0)));
    const club = await prisma.restaurant.findUniqueOrThrow({ where: { id: clubId }, select: { baseCurrency: true } });
    const rate = await exchangeRateService.getRate(club.baseCurrency, clubId);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.clubTabOrder.create({
        data: {
          restaurantId: clubId,
          bookingId: booking.id,
          courtName: booking.block.court.name,
          totalBase,
          exchangeRate: rate.rateBs,
          totalBs: round2(totalBase.mul(rate.rateBs)),
          // null = la tienda propia del club; si no, la tienda que prepara y cobra.
          kitchenRestaurantId: kitchen?.id ?? null,
          items: { create: lines },
        },
        include: { items: true },
      });

      for (const [productId, drop] of stockToDrop) {
        await tx.shopProductVariant.updateMany({
          where: { productId, v1: drop.variantV1 },
          data: { stock: { decrement: drop.quantity } },
        });
      }

      return created;
    });

    // El club refresca su Caja; la tienda, su cola de comandas.
    emitToKitchen(clubId, SocketEvents.CLUB_TAB_ORDER_NEW, { id: order.id, bookingId: booking.id });
    if (kitchen) {
      emitToKitchen(kitchen.id, SocketEvents.CLUB_TAB_ORDER_NEW, { id: order.id, courtName: order.courtName });
    }

    return {
      id: order.id,
      totalBase: order.totalBase.toFixed(2),
      totalBs: order.totalBs.toFixed(2),
      items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, lineTotal: i.lineTotal.toFixed(2) })),
    };
  },

  /**
   * Qué se abre al escribir la llave maestra: todas las canchas del club con la
   * reserva que tengan en curso, para que quien atiende elija cuál abrir sin
   * pedirle el QR a nadie.
   *
   * Con código inválido devuelve el MISMO error que un código de reserva que no
   * existe: si respondiera distinto, la pantalla serviría para adivinar si un
   * código es la llave maestra o no.
   */
  async masterCourts(clubId: string, code: string) {
    if (!isMasterCode(code)) throw notFound('Esta reserva no existe.');

    // Igual que al escanear un QR: en la cuenta demo las reservas se deslizan
    // solas, y sin esto todas las canchas saldrían libres.
    await refreshClubDemo(clubId, true);

    const now = new Date();
    // La misma ventana que abre el QR normal, para que "en curso" signifique lo
    // mismo en las dos entradas.
    const from = new Date(now.getTime() - OPEN_AFTER_MINUTES * 60_000);
    const to = new Date(now.getTime() + OPEN_BEFORE_MINUTES * 60_000);

    const courts = await prisma.clubCourt.findMany({
      where: { restaurantId: clubId, active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        blocks: {
          where: {
            kind: 'BOOKING',
            status: { not: 'CANCELLED' },
            startsAt: { lte: to },
            endsAt: { gte: from },
          },
          orderBy: { startsAt: 'asc' },
          take: 1,
          select: {
            startsAt: true,
            endsAt: true,
            booking: { select: { accessToken: true, playerName: true, playerCount: true, status: true } },
          },
        },
      },
    });

    return {
      courts: courts.map((c) => {
        const block = c.blocks[0];
        const booking = block?.booking;
        return {
          id: c.id,
          name: c.name,
          booking:
            booking && booking.status !== 'CANCELLED'
              ? {
                  accessToken: booking.accessToken,
                  playerName: booking.playerName,
                  playerCount: booking.playerCount,
                  startsAt: block.startsAt,
                  endsAt: block.endsAt,
                }
              : null,
        };
      }),
    };
  },

  /**
   * El jugador reporta desde la tablet que ya transfirió, con su referencia.
   *
   * NO cobra: crea un ClubReportedPayment en PENDING y la cuenta queda "en
   * verificación" hasta que el cobrador lo apruebe. Es el mismo criterio que el
   * resto de QuickTap — no hay pasarela, la plata la confirma una persona.
   */
  async reportPayment(clubId: string, userId: string, input: ReportTabPaymentInput) {
    // Segundo candado además del de la UI: si el club apagó "Pagar" desde la
    // tablet, el endpoint tampoco acepta reportes aunque alguien arme el POST a mano.
    const club = await prisma.restaurant.findUniqueOrThrow({
      where: { id: clubId },
      select: { clubTabletPaymentsEnabled: true, isDemo: true },
    });
    if (!club.clubTabletPaymentsEnabled) {
      throw badRequest('Este club desactivó los pagos desde la tablet. Paga en persona.');
    }

    const booking = await loadSession(clubId, input.accessToken);

    const tabletCourtId = await tabletCourtIdOf(userId);
    if (tabletCourtId && booking.block.courtId !== tabletCourtId) {
      throw badRequest('Esta reserva no es de esta cancha.');
    }

    const isClub = input.payeeId === CLUB_STORE_ID;
    const payeeId = isClub ? null : input.payeeId;
    if (payeeId) {
      const linked = await clubLinkService.resolveKitchensFor(clubId);
      if (!linked.some((k) => k.id === payeeId)) {
        throw badRequest('Esa tienda ya no está vinculada a este club.');
      }
    }

    // El tope sale del saldo real, calculado acá: si se confiara en el monto del
    // cliente se podrían reportar pagos por cualquier cifra y ensuciar la cola
    // de aprobación del cobrador.
    const consumoBase = consumoOf(booking.tabOrders);
    const paidBase = round2(booking.payments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)));
    const dueBase = round2(booking.totalBase.add(consumoBase));
    const tabs = await buildTabs(clubId, booking, dueBase, paidBase);
    const tab = tabs.find((t) => t.payeeId === input.payeeId);
    if (!tab) throw badRequest('Esa cuenta no existe o ya no tiene saldo.');

    // Lo ya reportado y sin revisar también ocupa saldo: si no, se podría
    // reportar dos veces el total y dejarle al cobrador el doble por aprobar.
    const room = round2(toDecimal(tab.balanceBase).sub(toDecimal(tab.pendingBase)));
    const amountBase = round2(toDecimal(input.amountBase));
    if (room.lte(0)) throw badRequest('Esa cuenta ya está reportada por completo. Espera la confirmación.');
    if (amountBase.gt(room.add(0.01))) {
      throw badRequest(`El monto no puede superar lo que falta por pagar (${room.toFixed(2)}).`);
    }

    const rate = booking.exchangeRate;
    const created = await prisma.clubReportedPayment.create({
      data: {
        restaurantId: clubId,
        bookingId: booking.id,
        payeeRestaurantId: payeeId,
        amountBase,
        exchangeRate: rate,
        amountBs: round2(amountBase.mul(rate)),
        method: input.method,
        referenceNumber: input.referenceNumber?.trim() || null,
      },
      select: { id: true, amountBase: true, amountBs: true },
    });

    // En el club demo no hay nadie del otro lado para aprobar: el pago se
    // confirma solo, al instante (la tablet le pone los ~3 segundos de
    // "verificando" por encima). Un pago al club crea el ClubBookingPayment
    // real — el mismo efecto que tendría la aprobación manual de recepción.
    if (club.isDemo) {
      await prisma.$transaction(async (tx) => {
        let bookingPaymentId: string | null = null;
        if (!payeeId) {
          const bp = await tx.clubBookingPayment.create({
            data: {
              bookingId: booking.id,
              amountBase,
              method: input.method,
              referenceNumber: input.referenceNumber?.trim() || null,
            },
            select: { id: true },
          });
          bookingPaymentId = bp.id;
          // Si con esto queda saldada, se apaga awaitingPayment — mismo criterio
          // que addBookingPayment en la Caja.
          if (round2(paidBase.add(amountBase)).gte(dueBase)) {
            await tx.clubBooking.update({ where: { id: booking.id }, data: { awaitingPayment: false } });
          }
        }
        await tx.clubReportedPayment.update({
          where: { id: created.id },
          data: { status: 'CONFIRMED', reviewedAt: new Date(), bookingPaymentId },
        });
      });
    }

    // Al cobrador le aparece en su cola de aprobación al instante.
    emitToKitchen(payeeId ?? clubId, SocketEvents.CLUB_TAB_ORDER_UPDATED, { paymentId: created.id });

    return {
      id: created.id,
      amountBase: created.amountBase.toFixed(2),
      amountBs: created.amountBs.toFixed(2),
    };
  },
};

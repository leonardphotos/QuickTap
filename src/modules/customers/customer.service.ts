import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { conflict, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { CreateCustomerInput, CustomerQuery, CustomerSegment, UpdateCustomerInput } from './customer.dto';

/** Umbrales de los segmentos del CRM. En días, contados hacia atrás desde hoy. */
const FREQUENT_MIN_VISITS = 3;
const NEW_DAYS = 30;
const INACTIVE_DAYS = 45;

/** Cumpleaños como fecha a mediodía, para que el huso no la corra de día. */
function parseBirthday(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(`${value}T12:00:00`);
}

interface CustomerStats {
  visits: number;
  totalBase: string;
  lastVisit: Date | null;
}

/**
 * Visitas, gasto total y última visita de cada cliente, según el vertical: un
 * restaurante vende Orders, un local ShopSales y un club reservas. Se agrupa por
 * teléfono TAL CUAL quedó guardado (es la misma captura que upsertea al cliente,
 * así que coinciden); las ventas sin teléfono no son atribuibles a nadie.
 */
async function statsByPhone(restaurantId: string, phones: string[]): Promise<Map<string, CustomerStats>> {
  const map = new Map<string, CustomerStats>();
  if (phones.length === 0) return map;

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { businessType: true },
  });

  const put = (phone: string | null, total: Prisma.Decimal | number | null, date: Date) => {
    if (!phone) return;
    const prev = map.get(phone) ?? { visits: 0, totalBase: '0', lastVisit: null as Date | null };
    prev.visits += 1;
    prev.totalBase = round2(toDecimal(prev.totalBase).add(total ?? 0)).toFixed(2);
    if (!prev.lastVisit || date > prev.lastVisit) prev.lastVisit = date;
    map.set(phone, prev);
  };

  if (restaurant.businessType === 'SHOP') {
    const sales = await prisma.shopSale.findMany({
      where: { restaurantId, returned: false, customerPhone: { in: phones } },
      select: { customerPhone: true, total: true, time: true },
    });
    for (const s of sales) put(s.customerPhone, s.total, s.time);
  } else if (restaurant.businessType === 'SPORTS_CLUB') {
    const bookings = await prisma.clubBooking.findMany({
      where: { restaurantId, status: { not: 'CANCELLED' }, playerPhone: { in: phones } },
      select: { playerPhone: true, totalBase: true, createdAt: true },
    });
    for (const b of bookings) put(b.playerPhone, b.totalBase, b.createdAt);
  } else {
    const orders = await prisma.order.findMany({
      where: { restaurantId, status: { not: 'CANCELLED' }, customerPhone: { in: phones } },
      select: { customerPhone: true, totalBase: true, createdAt: true },
    });
    for (const o of orders) put(o.customerPhone, o.totalBase, o.createdAt);
  }

  return map;
}

function inSegment(
  segment: CustomerSegment,
  customer: { createdAt: Date; birthday: Date | null },
  stats: CustomerStats | undefined,
  now: Date,
): boolean {
  switch (segment) {
    case 'ALL':
      return true;
    case 'FREQUENT':
      return (stats?.visits ?? 0) >= FREQUENT_MIN_VISITS;
    case 'NEW':
      return now.getTime() - customer.createdAt.getTime() <= NEW_DAYS * 86_400_000;
    case 'INACTIVE': {
      if (!stats?.lastVisit) return false;
      return now.getTime() - stats.lastVisit.getTime() > INACTIVE_DAYS * 86_400_000;
    }
    case 'BIRTHDAY':
      return customer.birthday != null && customer.birthday.getMonth() === now.getMonth();
  }
}

export const customerService = {
  /**
   * La lista del CRM: clientes con sus visitas/gasto/última visita y el filtro
   * por segmento (frecuentes, nuevos, inactivos, cumpleañeros del mes). El
   * resumen trae el conteo de cada segmento para pintar las píldoras.
   */
  async list(restaurantId: string, query: CustomerQuery) {
    const search = query.search?.trim();
    const customers = await prisma.customer.findMany({
      where: {
        restaurantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { idNumber: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      // Techo alto pero finito: el CRM de un negocio de barrio no pasa de acá; si
      // algún día pasa, el buscador sigue encontrando a cualquiera.
      take: 500,
    });

    const stats = await statsByPhone(
      restaurantId,
      customers.map((c) => c.phone),
    );
    const now = new Date();

    const withStats = customers.map((c) => {
      const s = stats.get(c.phone);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        idNumber: c.idNumber,
        address: c.address,
        email: c.email,
        birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
        notes: c.notes,
        createdAt: c.createdAt,
        visits: s?.visits ?? 0,
        totalBase: s?.totalBase ?? '0.00',
        lastVisit: s?.lastVisit ?? null,
      };
    });

    const count = (segment: CustomerSegment) =>
      customers.filter((c) => inSegment(segment, c, stats.get(c.phone), now)).length;

    const segment = query.segment ?? 'ALL';
    return {
      customers: withStats.filter((c, i) => inSegment(segment, customers[i], stats.get(c.phone), now)),
      summary: {
        total: customers.length,
        frequent: count('FREQUENT'),
        new: count('NEW'),
        inactive: count('INACTIVE'),
        birthday: count('BIRTHDAY'),
      },
    };
  },

  /**
   * La ficha completa: datos + historial reciente del vertical + campañas en las
   * que está incluido y códigos que canjeó.
   */
  async profile(restaurantId: string, id: string) {
    const customer = await prisma.customer.findFirst({ where: { id, restaurantId } });
    if (!customer) throw notFound('Cliente no encontrado.');

    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { businessType: true },
    });

    // Historial homogéneo (fecha, detalle, monto) venga de donde venga.
    let history: { date: Date; detail: string; amountBase: string }[] = [];
    if (restaurant.businessType === 'SHOP') {
      const sales = await prisma.shopSale.findMany({
        where: { restaurantId, customerPhone: customer.phone, returned: false },
        orderBy: { time: 'desc' },
        take: 20,
        select: { time: true, total: true, items: { select: { name: true }, take: 3 } },
      });
      history = sales.map((s) => ({
        date: s.time,
        detail: s.items.map((i) => i.name).join(', ') || 'Venta',
        amountBase: s.total.toFixed(2),
      }));
    } else if (restaurant.businessType === 'SPORTS_CLUB') {
      const bookings = await prisma.clubBooking.findMany({
        where: { restaurantId, playerPhone: customer.phone, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { totalBase: true, block: { select: { startsAt: true, court: { select: { name: true } } } }, createdAt: true },
      });
      history = bookings.map((b) => ({
        date: b.block?.startsAt ?? b.createdAt,
        detail: b.block?.court.name ?? 'Reserva',
        amountBase: b.totalBase.toFixed(2),
      }));
    } else {
      const orders = await prisma.order.findMany({
        where: { restaurantId, customerPhone: customer.phone, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { createdAt: true, orderNumber: true, channel: true, totalBase: true },
      });
      history = orders.map((o) => ({
        date: o.createdAt,
        detail: `Pedido #${o.orderNumber} · ${o.channel}`,
        amountBase: o.totalBase.toFixed(2),
      }));
    }

    const [targets, redemptions] = await Promise.all([
      prisma.promotionTarget.findMany({
        where: { customerId: id },
        orderBy: { promotion: { createdAt: 'desc' } },
        take: 20,
        include: { promotion: true },
      }),
      prisma.promotionRedemption.findMany({
        where: { customerId: id, restaurantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { promotion: { select: { name: true, code: true } } },
      }),
    ]);

    return {
      ...customer,
      birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null,
      history,
      promotions: targets.map((t) => ({
        id: t.promotion.id,
        name: t.promotion.name,
        code: t.promotion.code,
        isActive: t.promotion.isActive,
        endsAt: t.promotion.endsAt,
        sentAt: t.sentAt,
      })),
      redemptions: redemptions.map((r) => ({
        id: r.id,
        promotionName: r.promotion.name,
        code: r.promotion.code,
        amountBase: r.amountBase.toFixed(2),
        createdAt: r.createdAt,
      })),
    };
  },

  async create(restaurantId: string, input: CreateCustomerInput) {
    const existing = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone: input.phone } },
    });
    if (existing) throw conflict('Ya existe un cliente con ese teléfono.');
    return prisma.customer.create({
      data: { restaurantId, ...input, birthday: parseBirthday(input.birthday) },
    });
  },

  async update(restaurantId: string, id: string, input: UpdateCustomerInput) {
    const existing = await prisma.customer.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cliente no encontrado.');
    return prisma.customer.update({
      where: { id },
      data: { ...input, birthday: parseBirthday(input.birthday) },
    });
  },

  async remove(restaurantId: string, id: string) {
    const existing = await prisma.customer.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cliente no encontrado.');
    await prisma.customer.delete({ where: { id } });
    return { deleted: true };
  },

  /**
   * Crea o actualiza el cliente por teléfono cada vez que se abre una cuenta
   * de mesa o se hace un pedido con datos de contacto, para poder buscarlo
   * después en vez de tipear los datos de nuevo. Sin teléfono no hay forma
   * confiable de identificarlo, así que no hace nada.
   */
  async upsertFromOrder(
    restaurantId: string,
    data: { name?: string | null; phone?: string | null; idNumber?: string | null; address?: string | null },
  ) {
    if (!data.phone || !data.name) return;
    await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId, phone: data.phone } },
      create: {
        restaurantId,
        name: data.name,
        phone: data.phone,
        idNumber: data.idNumber ?? undefined,
        address: data.address ?? undefined,
      },
      update: {
        name: data.name,
        idNumber: data.idNumber ?? undefined,
        address: data.address ?? undefined,
      },
    });
  },
};

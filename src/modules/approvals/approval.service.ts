import type { ApprovalAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';

/**
 * Solicitudes de cambio de un administrador al dueño.
 *
 * El dueño de un local no está en el mostrador: delega en un administrador, pero hay cambios que
 * no quiere que ocurran sin enterarse — bajarle el precio a un producto, anular una venta ya
 * cobrada, "corregir" el stock. Ninguno deja rastro evidente si se hace y ya.
 *
 * Qué acciones se controlan lo decide cada dueño (Restaurant.approvalActions), no está fijo:
 * hay negocios donde el administrador es de la familia y otros donde es alguien recién
 * contratado. Sin configurar nada, no se controla ninguna — igual que antes de que esto
 * existiera, así que activar la función no le cambia el día a nadie hasta que el dueño quiera.
 */

/** Las cinco acciones y cómo se le explican al dueño en su idioma. */
export const APPROVAL_LABELS: Record<ApprovalAction, string> = {
  PRODUCT_PRICE: 'Cambiar el precio de un producto',
  PRODUCT_DELETE: 'Eliminar un producto',
  PRICE_RAISE: 'Aumento general de precios',
  STOCK_ADJUST: 'Recuento físico (fijar stock a mano)',
  SALE_RETURN: 'Anular una venta cobrada',
};

/**
 * Ejecuta la acción aprobada. Va aparte del servicio de cada módulo a propósito: al aprobar hay
 * que correr el cambio SIN volver a pasar por el control de aprobación, o se pediría permiso
 * para lo que el dueño acaba de autorizar.
 */
async function aplicar(restaurantId: string, action: ApprovalAction, payload: Prisma.JsonValue) {
  const p = payload as Record<string, unknown>;

  switch (action) {
    case 'PRODUCT_PRICE': {
      const producto = await prisma.shopProduct.findFirst({ where: { id: String(p.productId), restaurantId } });
      if (!producto) throw notFound('El producto ya no existe.');
      await prisma.shopProduct.update({ where: { id: producto.id }, data: { price: Number(p.price) } });
      return;
    }
    case 'PRODUCT_DELETE': {
      const producto = await prisma.shopProduct.findFirst({ where: { id: String(p.productId), restaurantId } });
      if (!producto) throw notFound('El producto ya no existe.');
      await prisma.shopProduct.delete({ where: { id: producto.id } });
      return;
    }
    case 'PRICE_RAISE': {
      const factor = 1 + Number(p.percent) / 100;
      await prisma.$executeRaw`UPDATE "shop_products" SET "price" = ROUND(("price" * ${factor})::numeric, 2) WHERE "restaurantId" = ${restaurantId}`;
      return;
    }
    case 'STOCK_ADJUST': {
      const variante = await prisma.shopProductVariant.findFirst({
        where: { id: String(p.variantId), product: { restaurantId } },
      });
      if (!variante) throw notFound('La variante ya no existe.');
      await prisma.shopProductVariant.update({ where: { id: variante.id }, data: { stock: Number(p.stock) } });
      return;
    }
    case 'SALE_RETURN': {
      const venta = await prisma.shopSale.findFirst({ where: { id: String(p.saleId), restaurantId } });
      if (!venta) throw notFound('La venta ya no existe.');
      if (venta.returned) throw badRequest('Esa venta ya estaba anulada.');
      await prisma.shopSale.update({ where: { id: venta.id }, data: { returned: true } });
      return;
    }
  }
}

export const approvalService = {
  /** Qué acciones tiene bajo control este local. */
  async policy(restaurantId: string): Promise<ApprovalAction[]> {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { approvalActions: true } });
    const raw = r?.approvalActions;
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is ApprovalAction => typeof a === 'string' && a in APPROVAL_LABELS);
  },

  async setPolicy(restaurantId: string, actions: ApprovalAction[]) {
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { approvalActions: actions } });
    return { actions };
  },

  /**
   * ¿Este usuario necesita permiso para esta acción? Solo el ADMIN pide permiso: el dueño no se
   * lo pide a sí mismo, y los roles restringidos (mesonero, cocina) no llegan a estas pantallas.
   */
  async requiereAprobacion(restaurantId: string, role: string, action: ApprovalAction) {
    if (role !== 'ADMIN') return false;
    return (await this.policy(restaurantId)).includes(action);
  },

  async crear(input: {
    restaurantId: string;
    action: ApprovalAction;
    payload: Prisma.InputJsonValue;
    summary: string;
    userId: string;
  }) {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true } });
    return prisma.approvalRequest.create({
      data: {
        restaurantId: input.restaurantId,
        action: input.action,
        payload: input.payload,
        summary: input.summary,
        requestedByUserId: input.userId,
        requestedByUserName: user?.name ?? 'Administrador',
      },
    });
  },

  async list(restaurantId: string, status?: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA') {
    return prisma.approvalRequest.findMany({
      where: { restaurantId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  async pendingCount(restaurantId: string) {
    return prisma.approvalRequest.count({ where: { restaurantId, status: 'PENDIENTE' } });
  },

  /**
   * El dueño aprueba: recién acá corre el cambio. Si la ejecución falla (el producto se borró
   * mientras tanto, la venta ya estaba anulada), la solicitud queda APROBADA con `applyError`
   * en vez de tirar el error y perderse — el dueño tiene que poder ver que autorizó algo que
   * no se pudo hacer, o va a creer que el cambio quedó aplicado.
   */
  async resolver(
    restaurantId: string,
    id: string,
    input: { aprobar: boolean; note?: string; reviewerUserId: string },
  ) {
    const req = await prisma.approvalRequest.findFirst({ where: { id, restaurantId } });
    if (!req) throw notFound('Solicitud no encontrada.');
    if (req.status !== 'PENDIENTE') throw badRequest('Esa solicitud ya fue resuelta.');

    let applyError: string | null = null;
    let appliedAt: Date | null = null;
    if (input.aprobar) {
      try {
        await aplicar(restaurantId, req.action, req.payload);
        appliedAt = new Date();
      } catch (err) {
        applyError = err instanceof Error ? err.message : 'No se pudo aplicar el cambio.';
      }
    }

    return prisma.approvalRequest.update({
      where: { id },
      data: {
        status: input.aprobar ? 'APROBADA' : 'RECHAZADA',
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewNote: input.note ?? null,
        appliedAt,
        applyError,
      },
    });
  },
};

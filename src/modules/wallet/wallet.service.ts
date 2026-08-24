import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { badRequest } from '../../utils/http-error';
import { resumirCuota } from '../shop/shop-installments.service';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { telefonoCanonico } from '../../utils/phone';

/**
 * QuickTap Wallet: el portal donde un cliente ve sus compras y lo que debe.
 *
 * Tercer ámbito de autenticación del sistema, aparte del panel del negocio y del dashboard
 * maestro. El token lleva `scope: 'wallet'` justo para que no pueda usarse contra los otros dos:
 * los tres se firman con el mismo secreto, así que la separación tiene que estar en el
 * contenido, no en la llave.
 *
 * Entra con teléfono + cédula, por decisión del producto. Los dos datos son fáciles de
 * conseguir, así que un token de Wallet solo abre lectura de sus propias compras: no puede pagar,
 * ni modificar nada, ni ver datos del negocio.
 */

const WALLET_TOKEN_DAYS = 30;

export interface WalletPayload {
  customerId: string;
  scope: 'wallet' | 'pass';
}

/** Deja el teléfono en solo dígitos para comparar: el cliente lo escribe de mil formas. */
function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** La cédula se compara sin puntos, guiones ni la letra de nacionalidad (V/E/J). */
function normalizarCedula(valor: string): string {
  return valor.replace(/[^0-9]/g, '');
}


export const walletService = {
  async login(input: { phone: string; idNumber: string }) {
    const telefono = soloDigitos(input.phone);
    const cedula = normalizarCedula(input.idNumber);
    if (!telefono || !cedula) throw badRequest('Escribe tu teléfono y tu cédula.');

    // Un mismo teléfono puede existir en varios negocios: se buscan todos y se valida la cédula
    // contra cualquiera que la tenga cargada.
    const candidatos = await prisma.customer.findMany({
      where: { phone: { contains: telefono.slice(-7) } },
      select: { id: true, name: true, phone: true, idNumber: true },
    });

    const cliente = candidatos.find(
      (c) => soloDigitos(c.phone).endsWith(telefono.slice(-7)) && c.idNumber && normalizarCedula(c.idNumber) === cedula,
    );
    // Mensaje único para acierto y error de cédula: distinguirlos permitiría averiguar qué
    // teléfonos están registrados probando cédulas al azar.
    if (!cliente) throw badRequest('No encontramos una cuenta con esos datos.');

    const payload: WalletPayload = { customerId: cliente.id, scope: 'wallet' };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: `${WALLET_TOKEN_DAYS}d` });
    return { token, customer: { id: cliente.id, name: cliente.name } };
  },

  /**
   * Las entradas de eventos que compró el cliente, en cualquier negocio.
   *
   * Se buscan por teléfono igual que las compras (ver `resumen`): la ficha de cliente es por
   * restaurante, así que buscar por id mostraría solo las de un local. Solo aparecen las que ya
   * existen — un boleto se emite recién cuando el pago quedó verificado, así que si está acá es
   * porque el local ya lo aprobó.
   */
  async entradas(customerId: string) {
    const yo = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true } });
    if (!yo) throw badRequest('Cuenta no encontrada.');
    const miTelefono = telefonoCanonico(yo.phone);

    const candidatas = await prisma.shopTicket.findMany({
      where: { holderPhone: { contains: soloDigitos(yo.phone).slice(-7) } },
      orderBy: [{ eventDate: 'asc' }, { seatNumber: 'asc' }],
      include: {
        restaurant: { select: { name: true } },
        // El arte se lee en vivo del evento, no congelado — ver shop-tickets.service.ts.
        product: { select: { photoUrl: true } },
      },
    });
    const mias = candidatas.filter((t) => telefonoCanonico(t.holderPhone) === miTelefono);

    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
    return mias.map((t) => ({
      id: t.id,
      accessToken: t.accessToken,
      negocio: t.restaurant.name,
      evento: t.eventName,
      fecha: t.eventDate,
      hora: t.eventTime,
      puesto: t.seatNumber,
      precio: t.price,
      titular: t.holderName,
      imagen: t.product?.photoUrl ?? null,
      usada: t.checkedInAt != null,
      usadaEl: t.checkedInAt,
      // Un evento cuya fecha ya pasó se muestra aparte: el cliente entra a Wallet a buscar la
      // entrada de esta noche, no la del mes pasado.
      pasado: !!t.eventDate && t.eventDate < hoy,
    }));
  },

  /**
   * Resumen de todas las compras del cliente, en todos los negocios donde compró.
   *
   * Se agrupa por teléfono y no por id de cliente: cada negocio tiene su propia ficha del mismo
   * comprador (Customer se crea por restaurante), así que buscar solo por id mostraría las
   * compras de un local y escondería las del resto.
   */
  async resumen(customerId: string) {
    const yo = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true, name: true } });
    if (!yo) throw badRequest('Cuenta no encontrada.');
    const cola = soloDigitos(yo.phone).slice(-7);
    const miTelefono = telefonoCanonico(yo.phone);

    // El `contains` de los últimos 7 es solo un PREFILTRO barato para que SQL no traiga toda la
    // tabla: tolera que cada negocio guarde el número con su propio formato. La coincidencia de
    // verdad se decide abajo comparando el número canónico completo.
    const candidatas = await prisma.shopSale.findMany({
      where: { customerPhone: { contains: cola }, returned: false },
      orderBy: { time: 'desc' },
      include: {
        restaurant: { select: { name: true, whatsappPhone: true } },
        payments: true,
        // addedAt y no el `time` de la venta: una cuenta fiada acumula las compras de varios
        // días (ver recordSale), así que cada línea sabe cuándo se llevó.
        items: { select: { name: true, qty: true, addedAt: true }, orderBy: { addedAt: 'desc' } },
        installmentPlan: { include: { installments: { orderBy: { number: 'asc' } } } },
      },
    });
    const ventas = candidatas.filter((v) => telefonoCanonico(v.customerPhone) === miTelefono);

    // Tasa para mostrar todo también en bolívares, que es como el cliente paga. Si la fuente
    // está caída se sigue mostrando en dólares y nada más: no vale la pena dejar al cliente sin
    // ver su deuda por un problema aparte.
    let rateBs: number | null = null;
    try {
      rateBs = Number((await exchangeRateService.getRate('USD')).rateBs) || null;
    } catch {
      rateBs = null;
    }

    let totalComprado = 0;
    let totalAbonado = 0;

    const compras = ventas.map((v) => {
      // SOLO una venta a crédito deja saldo. Una venta de contado ya se cobró en el mostrador y
      // no genera ningún ShopSalePayment (el método de pago va en la propia venta), así que
      // contarla como deuda mostraba como impaga cada compra que el cliente ya había pagado.
      // Es el mismo criterio que usa el lado del negocio en walletInboxService.deudores.
      const aCredito = v.creditTerms != null;

      // El recargo por financiar se le cobra al cliente igual que la mora, así que entra en lo
      // que debe. Se muestra sumado y no aparte para no llenar el portal de renglones.
      const mora = aCredito
        ? (v.installmentPlan?.installments.reduce((a, c) => a + c.lateFeeCharged, 0) ?? 0)
          + (v.installmentPlan?.surchargeAmount ?? 0)
        : 0;
      const aPagar = Math.round((v.total + mora) * 100) / 100;
      const abonado = aCredito
        ? Math.round(((v.amountPaidNow ?? 0) + v.payments.reduce((a, p) => a + p.amount, 0)) * 100) / 100
        : aPagar;
      const saldo = Math.max(0, Math.round((aPagar - abonado) * 100) / 100);

      totalComprado += aPagar;
      totalAbonado += Math.min(abonado, aPagar);

      const cuotas =
        v.installmentPlan?.installments.map((c) => resumirCuota(c, v.installmentPlan!.alertDaysBefore)) ?? [];

      return {
        id: v.id,
        negocio: v.restaurant.name,
        // El WhatsApp del negocio, para que el cliente pueda escribirle por esta compra
        // desde el mismo portal (queda null si el negocio no lo tiene cargado).
        whatsappNegocio: v.restaurant.whatsappPhone,
        // `fecha` es cuándo se abrió la cuenta; `ultimaCompra`, lo último que se llevó. En una
        // cuenta fiada que fue creciendo no son lo mismo, y lo que el cliente reconoce es lo
        // último.
        fecha: v.time,
        ultimaCompra: v.items.reduce<Date>((max, i) => (i.addedAt > max ? i.addedAt : max), v.time),
        esCredito: aCredito,
        detalle: v.items.map((i) => `${i.qty}× ${i.name}`),
        // Cada línea con su fecha, para poder desglosar una cuenta que junta varios días.
        lineas: v.items.map((i) => ({ texto: `${i.qty}× ${i.name}`, fecha: i.addedAt })),
        total: aPagar,
        abonado,
        saldo,
        mora,
        // Cuánto lleva pagado, para la barra de progreso del portal.
        progreso: aPagar > 0 ? Math.min(100, Math.round((abonado / aPagar) * 100)) : 100,
        cuotas,
        // Lo que el portal usa para avisar antes de que caiga la mora.
        proximaCuota: cuotas.find((c) => c.estado === 'POR_VENCER' || c.estado === 'VENCIDA') ?? null,
      };
    });

    return {
      cliente: { nombre: yo.name },
      rateBs,
      resumen: {
        totalComprado: Math.round(totalComprado * 100) / 100,
        totalAbonado: Math.round(totalAbonado * 100) / 100,
        totalPendiente: Math.round((totalComprado - totalAbonado) * 100) / 100,
        comprasActivas: compras.filter((c) => c.saldo > 0).length,
      },
      compras,
    };
  },
};

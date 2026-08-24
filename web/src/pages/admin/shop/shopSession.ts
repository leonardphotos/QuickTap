import { useEffect, useRef, useState } from 'react';
import type { ShopProductSeed, ShopVariant } from '@/data/shopRubros';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { shopApi, toShopProduct } from './shopApi';
import { rollWidthLabel } from './printPricing';

/**
 * Estado de una sesión de QuickTap Shop: catálogo, carrito, ventas, compras y caja. El carrito
 * vive solo en memoria (una venta en curso no necesita sobrevivir un refresh); todo lo demás se
 * hidrata una vez desde el backend al montar (GET /shop/state) y cada mutación se aplica local
 * de inmediato (misma UX de siempre, sin esperar la red) y se persiste en paralelo vía shopApi —
 * ver src/modules/shop/ en el backend. Si la persistencia falla, la sesión sigue funcionando con
 * el estado local (se pierde en el próximo refresh, pero no bloquea al cajero a mitad de venta).
 */

export type ShopProduct = ShopProductSeed;

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  price: number;
  /** Copiados del producto al agregar — permiten recalcular el precio efectivo en vivo a medida
   * que cambia la cantidad de la línea (ver effectivePrice), en vez de fijar el precio una sola
   * vez al momento de agregar al carrito. */
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  promoPrice?: number;
  v1: string;
  v2: string;
  qty: number;
  disc: number;
  /** Copiado de la variante al agregar — la cantidad de esta línea es un peso en Kg (decimal),
   * no unidades enteras (ver ShopPosPage: pide el peso en un diálogo en vez de sumar de a 1). */
  soldByWeight?: boolean;
  /** Solo en líneas "servicio no registrado" (ver addAdhocLine, exclusivo rubro Agencia de
   * Publicidad): costo escrito a mano, porque no hay un ShopProduct real del que derivarlo. */
  cost?: number;
  /** Impresión de gran formato: de dónde salió la cantidad de esta línea — "1,20 × 0,80 m ·
   * rollo 1,37". Sin esto la venta solo mostraría "1,096" y nadie sabría qué se imprimió. */
  detail?: string;
  /** Unidad a mostrar junto a la cantidad ('m²' en impresión). Ausente = unidades. */
  unitLabel?: string;
  /** Cuánto descontar del stock cuando difiere de `qty`. Hoy no lo usa ninguna línea (en
   * impresión el material se lleva en m² y coincide con lo facturado), pero se conserva para
   * casos donde lo cobrado y lo consumido no sean el mismo número. */
  stockQty?: number;
  /** Profesional que presta ESTE servicio (barbero/estilista) — alimenta su reporte y comisión. */
  staffUserId?: string;

  // --- Plan de consumo ---
  /** Esta línea ACTIVA un plan nuevo (el cliente paga el paquete completo por adelantado): a
   * qué producto y cuántas unidades. No toca stock — el cliente aún no se lleva nada, solo
   * compró el derecho a retirarlo después (ver addConsumptionPlanLine). */
  newPlanProductId?: string;
  newPlanUnits?: number;
  /** Esta línea CONSUME un plan ya activo: id del plan. La línea es un producto real (sí
   * descuenta stock, el cliente se lo lleva ahora) con disc=100 — ya se cobró al activar el
   * plan, así que no se vuelve a cobrar (ver toggleConsumePlan). */
  consumePlanId?: string;
}

/** Precio unitario que realmente aplica a una línea del carrito: la promoción siempre gana (si
 * está seteada), si no el mayorista cuando la cantidad llega al mínimo, si no el precio de lista. */
export function effectivePrice(c: Pick<CartLine, 'price' | 'promoPrice' | 'wholesalePrice' | 'wholesaleMinQty' | 'qty'>): number {
  if (c.promoPrice != null) return c.promoPrice;
  if (c.wholesalePrice != null && c.wholesaleMinQty != null && c.qty >= c.wholesaleMinQty) return c.wholesalePrice;
  return c.price;
}

export interface SaleItem {
  productId: string;
  v1: string;
  v2: string;
  name: string;
  category: string | null;
  qty: number;
  price: number;
  cost: number;
  soldByWeight?: boolean;
  detail?: string;
  stockQty?: number;
  staffUserId?: string;
  /** Comisión congelada de esta línea al momento de la venta (ver ShopSaleItem en el backend). */
  commissionPercent?: number;
  commissionBase?: number;
}

export interface PaymentMeta {
  reference?: string;
  hasProof?: boolean;
  /** URL del comprobante subido (screenshot de la transferencia/Pago Móvil) — se muestra en el
   * detalle de la venta (Panel administrativo → Ventas recientes). */
  proofImageUrl?: string;
}

export type CreditTerms = 'FULL' | 'INSTALLMENT';

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  time: Date;
  customerName: string | null;
  /** Solo dígitos (sin espacios/guiones) — se usa para armar el enlace de WhatsApp y para agrupar
   * al mismo cliente entre varias compras en la pantalla de Clientes. */
  customerPhone: string | null;
  returned: boolean;
  paymentMethod: string | null;
  paymentMeta: PaymentMeta | null;
  /** Venta fiada: 'FULL' = se paga todo más adelante, 'INSTALLMENT' = se abonó algo ahora, resto pendiente. Null = venta normal. */
  creditTerms: CreditTerms | null;
  /** Solo relevante si creditTerms está seteado — cuánto se cobró en el momento de la venta. */
  amountPaidNow: number | null;
  /** Quién cobró la venta (cajero/vendedor) — nombre congelado al momento de vender, para el
   * historial cuando el local tiene varios usuarios con acceso a la caja. */
  soldByUserId: string | null;
  soldByUserName: string | null;
}

export interface Purchase {
  id: string;
  supplier: string;
  productName: string;
  v1: string;
  v2: string;
  qty: number;
  cost: number;
  /** Lo que pesó esta carga en Kg (ver ShopPurchase.weightKg). */
  weightKg?: number;
  time: Date;
}

export interface Till {
  opening: number;
  openedAt: Date;
}

/** Sesión de caja ya cerrada, con el arqueo congelado — para poder ver "informes de caja"
 * históricos en vez de perder el resumen apenas se cierra la caja. */
export interface ClosedTill {
  id: string;
  openedAt: Date;
  closedAt: Date;
  opening: number;
  salesCount: number;
  totalSales: number;
  expected: number;
  counted: number;
  diff: number;
}

/** Corrección manual de stock (recuento físico / auditoría) — a diferencia de una compra, fija
 * el stock a la cantidad contada en vez de sumarle unidades. */
export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  v1: string;
  v2: string;
  before: number;
  after: number;
  diff: number;
  reason: string;
  time: Date;
}

export function productStock(p: ShopProduct): number {
  return p.variants.reduce((a, v) => a + v.stock, 0);
}

export type ProductStatus = 'ok' | 'warn' | 'danger';

export function productStatus(p: ShopProduct): ProductStatus {
  // Un servicio (estética/barbería) no tiene mercancía que agotarse: siempre disponible.
  if (p.pricingMode === 'SERVICE') return 'ok';
  const stock = productStock(p);
  if (stock === 0) return 'danger';
  if (stock <= p.minStock) return 'warn';
  return 'ok';
}

export function lineTotal(c: CartLine): number {
  return effectivePrice(c) * c.qty * (1 - (c.disc || 0) / 100);
}

export function saleProfit(sale: Sale): number {
  return sale.items.reduce((a, it) => a + (it.price - it.cost) * it.qty, 0);
}

export function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function isLast30Days(date: Date): boolean {
  return date.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}

/** Días hasta que vence un producto (negativo si ya venció), o null si no tiene fecha cargada. */
export function daysUntilExpiry(p: ShopProduct): number | null {
  if (!p.expiryDate) return null;
  const ms = new Date(`${p.expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** "Próximo a vencer" para efectos de la alerta del dashboard: dentro de 30 días (incluye ya vencidos). */
export function isExpiringSoon(p: ShopProduct): boolean {
  const days = daysUntilExpiry(p);
  return days != null && days <= 30;
}

/** Una línea de la receta de insumos de un servicio. */
export interface ServiceSupply {
  id: string;
  serviceProductId: string;
  supplyProductId: string;
  supplyV1: string;
  supplyV2: string;
  quantity: number;
}

/**
 * Aplica en el estado local el mismo movimiento de stock que hace el backend al vender/devolver:
 * lo vendido de cada variante MÁS los insumos que consumen los servicios del ticket. `sign` = -1
 * al vender, +1 al devolver. Espejo de applySupplyConsumption en src/modules/shop/shop.service.ts
 * — si los dos se desalinean, el cajero ve un stock que no es el que quedó guardado.
 */
function applyStockMovement(
  products: ShopProduct[],
  lines: { productId: string; v1: string; v2: string; qty: number; stockQty?: number }[],
  supplies: ServiceSupply[],
  sign: 1 | -1,
): ShopProduct[] {
  // Delta por producto+variante, empezando por lo que se vendió.
  const delta = new Map<string, number>();
  const key = (productId: string, v1: string, v2: string) => `${productId}|${v1}|${v2}`;
  for (const l of lines) {
    const k = key(l.productId, l.v1, l.v2);
    delta.set(k, (delta.get(k) ?? 0) + sign * (l.stockQty ?? l.qty));
  }

  // Y sumando los insumos que consumen los servicios vendidos.
  const soldByService = new Map<string, number>();
  for (const l of lines) soldByService.set(l.productId, (soldByService.get(l.productId) ?? 0) + l.qty);
  for (const r of supplies) {
    const sold = soldByService.get(r.serviceProductId) ?? 0;
    if (sold <= 0) continue;
    const k = key(r.supplyProductId, r.supplyV1, r.supplyV2);
    delta.set(k, (delta.get(k) ?? 0) + sign * r.quantity * sold);
  }

  if (delta.size === 0) return products;
  return products.map((p) => {
    const touched = p.variants.some((v) => delta.has(key(p.id, v.v1, v.v2)));
    if (!touched) return p;
    return {
      ...p,
      variants: p.variants.map((v) => {
        const d = delta.get(key(p.id, v.v1, v.v2));
        // Redondeado a 3 decimales: sin esto, restar fracciones (0,025 de un pote por corte)
        // arrastra error binario y el stock termina mostrándose como 9.924999999999999.
        return d == null ? v : { ...v, stock: Math.max(0, Math.round((v.stock + d + Number.EPSILON) * 1000) / 1000) };
      }),
    };
  });
}

export interface NewProductInput {
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  sku: string;
  location: string;
  price: number;
  cost: number;
  minStock: number;
  variants: ShopVariant[];
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  promoPrice?: number;
  expiryDate?: string;
  photoUrl?: string;
  pricingMode?: 'UNIT' | 'AREA_ROLL' | 'SERVICE';
  rollWidths?: number[];
  rollLengthM?: number;
  /** Unidad de venta: por unidad, kilo o metro (ver ShopProduct.saleUnit). */
  saleUnit?: 'UND' | 'KG' | 'MT';
  isEvent?: boolean;
  eventDate?: string;
  eventSeats?: number;
  consumptionPlanEnabled?: boolean;
  consumptionPlanRate?: number;
  consumptionPlanSizes?: number[];
}

// Una cuenta nueva arranca sin nada: el dueño carga su propio catálogo desde cero (Inventario
// → Nuevo producto). El catálogo de ejemplo del rubro (shopRubros.ts) ya no se usa para sembrar
// productos/ventas — solo aporta categorías/dim1/dim2/proveedores a ShopInventoryPage/ShopPosPage.
export function useShopSession(initialCategories: string[] = []) {
  // Quién está cobrando ahora mismo — se usa para reflejar de inmediato "vendedor" en la venta
  // recién hecha, sin esperar la respuesta del servidor (que igual guarda lo mismo, ver
  // shop.service.ts recordSale — ese es el que manda, este es solo el eco optimista local).
  const { user } = useAuth();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  // Recetas de insumos por servicio (ver ShopServiceSupply): qué gasta cada corte del inventario.
  const [serviceSupplies, setServiceSupplies] = useState<ServiceSupply[]>([]);
  // Equipo que presta servicios, con su comisión: se usa para acreditar la venta y para poder
  // calcular la comisión en el acto (el backend la congela igual, esto solo evita que el panel
  // muestre 0 hasta el próximo refresh).
  const [providers, setProviders] = useState<{ id: string; name: string; commissionPercent: number | null }[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get('/team')
      .then((res) => {
        if (cancelled) return;
        const list = (res.data.data as { id: string; name: string; isServiceProvider?: boolean; isActive: boolean; commissionPercent?: number | null }[])
          .filter((u) => u.isServiceProvider && u.isActive)
          .map((u) => ({ id: u.id, name: u.name, commissionPercent: u.commissionPercent ?? null }));
        setProviders(list);
      })
      .catch(() => setProviders([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Profesional al que se le acredita lo que se agregue al carrito (selector "Atendido por").
  const [activeStaffUserId, setActiveStaffUserId] = useState<string>('');

  /**
   * Cambiar de profesional también rellena hacia atrás las líneas que todavía no tienen a nadie
   * asignado: lo natural es agregar el corte y recién ahí elegir quién lo hizo, y si solo valiera
   * para lo que se agregue después esa venta quedaría sin acreditar sin que nadie lo note. Las
   * líneas que YA tienen un profesional no se tocan, para que un ticket con dos barberos siga
   * funcionando (se elige uno, se agrega lo suyo, se cambia y se agrega lo del otro).
   */
  function selectActiveStaff(userId: string) {
    setActiveStaffUserId(userId);
    setCart((prev) => prev.map((c) => (c.staffUserId ? c : { ...c, staffUserId: userId || undefined })));
  }
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [till, setTill] = useState<Till | null>(null);
  const [closedTills, setClosedTills] = useState<ClosedTill[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  // Categorías del catálogo del rubro + las que el dueño va creando desde Inventario — no están
  // atadas a un rubro en particular, cualquier Local Comercial puede organizar su propio catálogo.
  const [categories, setCategories] = useState<string[]>(initialCategories);
  // Subcategorías ya usadas, agrupadas por categoría — solo para sugerir/organizar (el campo de
  // subcategoría sigue siendo texto libre en el formulario de producto).
  const [subcategories, setSubcategories] = useState<Record<string, string[]>>({});
  // true hasta que se resuelve la carga inicial desde el backend — ShopLayout muestra un loader
  // en vez de renderizar con un catálogo vacío que luego "salta" al llegar los datos reales.
  const [loading, setLoading] = useState(true);

  // Productos recién creados (id temporal local) cuyo POST al backend todavía no resolvió — las
  // mutaciones que referencian ese producto (comprar, ajustar stock) esperan este id real antes
  // de llamar a la API, para no mandar un productId que Postgres todavía no conoce.
  const pendingProductIds = useRef<Map<string, Promise<string>>>(new Map());
  async function resolveServerProductId(id: string): Promise<string> {
    return (await pendingProductIds.current.get(id)) ?? id;
  }

  useEffect(() => {
    let cancelled = false;
    shopApi
      .getState()
      .then((state) => {
        if (cancelled) return;
        setProducts(state.products.map(toShopProduct));
        setServiceSupplies(state.serviceSupplies ?? []);
        setSales(
          state.sales.map((s) => ({
            id: s.id,
            items: s.items.map((it) => ({
              productId: it.productId ?? '',
              v1: it.v1,
              v2: it.v2,
              name: it.name,
              category: it.category,
              qty: it.qty,
              price: it.price,
              cost: it.cost,
              soldByWeight: it.soldByWeight,
              detail: it.detail ?? undefined,
              stockQty: it.stockQty ?? undefined,
              staffUserId: it.staffUserId ?? undefined,
              commissionPercent: it.commissionPercent ?? undefined,
              commissionBase: it.commissionBase ?? undefined,
            })),
            total: s.total,
            time: new Date(s.time),
            customerName: s.customerName,
            customerPhone: s.customerPhone,
            returned: s.returned,
            paymentMethod: s.paymentMethod,
            paymentMeta: s.paymentMeta,
            creditTerms: s.creditTerms,
            amountPaidNow: s.amountPaidNow,
            soldByUserId: s.soldByUserId,
            soldByUserName: s.soldByUserName,
          })),
        );
        setPurchases(
          state.purchases.map((p) => ({
            id: p.id,
            supplier: p.supplier,
            productName: p.productName,
            v1: p.v1,
            v2: p.v2,
            qty: p.qty,
            cost: p.cost,
            time: new Date(p.time),
          })),
        );
        setAdjustments(
          state.adjustments.map((a) => ({
            id: a.id,
            productId: a.productId ?? '',
            productName: a.productName,
            v1: a.v1,
            v2: a.v2,
            before: a.before,
            after: a.after,
            diff: a.diff,
            reason: a.reason,
            time: new Date(a.time),
          })),
        );
        setCategories((prev) => {
          const merged = [...state.categories];
          for (const c of prev) if (!merged.includes(c)) merged.push(c);
          return merged;
        });
        setSubcategories(state.subcategories);
        setTill(state.till ? { opening: state.till.opening, openedAt: new Date(state.till.openedAt) } : null);
        setClosedTills(
          state.closedTills.map((t) => ({
            id: t.id,
            openedAt: new Date(t.openedAt),
            closedAt: new Date(t.closedAt as string),
            opening: t.opening,
            salesCount: t.salesCount ?? 0,
            totalSales: t.totalSales ?? 0,
            expected: t.expected ?? 0,
            counted: t.counted ?? 0,
            diff: t.diff ?? 0,
          })),
        );
      })
      .catch((err) => {
        console.error('No se pudo cargar el estado de QuickTap Shop desde el servidor', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Carga única al montar — ShopLayout crea un solo useShopSession por sesión de panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    shopApi.addCategory(trimmed).catch((err) => console.error('No se pudo guardar la categoría', err));
  }

  function addSubcategory(category: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || !category) return;
    setSubcategories((prev) => {
      const existing = prev[category] ?? [];
      if (existing.includes(trimmed)) return prev;
      return { ...prev, [category]: [...existing, trimmed] };
    });
    shopApi.addSubcategory(category, trimmed).catch((err) => console.error('No se pudo guardar la subcategoría', err));
  }

  function addToCart(product: ShopProduct, variant: ShopVariant, qty = 1) {
    // El profesional entra en la clave: si dos barberos hacen el mismo corte en un ticket, deben
    // quedar como dos líneas separadas o se le acreditaría todo a uno solo.
    const key = `${product.id}-${variant.v1}-${variant.v2}-${activeStaffUserId}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) return prev.map((c) => (c.key === key ? { ...c, qty: c.qty + qty } : c));
      return [
        ...prev,
        {
          key,
          productId: product.id,
          name: product.name,
          // La variante manda cuando trae precio propio: en la lista de Monteranch la misma
          // manguera vale distinto según la presión, y todo lo de abajo (subtotal, comanda,
          // cobro) sale de este número.
          price: variant.price ?? product.price,
          cost: variant.cost,
          wholesalePrice: product.wholesalePrice,
          wholesaleMinQty: product.wholesaleMinQty,
          promoPrice: product.promoPrice,
          v1: variant.v1,
          v2: variant.v2,
          qty,
          disc: 0,
          soldByWeight: variant.soldByWeight,
          staffUserId: activeStaffUserId || undefined,
        },
      ];
    });
  }

  /**
   * Línea de carrito de impresión de gran formato (productos con pricingMode = 'AREA_ROLL'):
   * la cantidad son los m² facturables ya resueltos contra el ancho de rollo (ver
   * printPricing.ts), y `price` es el precio por m². Cada pieza entra como su propia línea
   * aunque se repita el producto — dos piezas de medidas distintas del mismo banner no se
   * pueden sumar en una sola cantidad sin perder qué se imprimió.
   */
  function addPrintLine(product: ShopProduct, quote: { billedM2: number; lengthM: number; rollWidth: number }, detail: string) {
    setCart((prev) => [
      ...prev,
      {
        key: `print-${product.id}-${Date.now()}`,
        productId: product.id,
        name: product.name,
        price: product.price,
        promoPrice: product.promoPrice,
        // v1 = ancho del rollo: identifica la variante que lleva los metros lineales de ESE
        // rollo, que es de donde se descuenta el material (ver rollWidthLabel).
        v1: rollWidthLabel(quote.rollWidth),
        v2: '',
        qty: quote.billedM2,
        disc: 0,
        detail,
        unitLabel: 'm²',
        // No se setea stockQty: el material del rollo se lleva en m² y se consume el ancho
        // COMPLETO por el largo impreso, que es exactamente lo que se factura (billedM2). Los
        // dos números coinciden, así que descontar `qty` es lo correcto.
        staffUserId: activeStaffUserId || undefined,
      },
    ]);
  }

  /** Línea de carrito para un servicio no registrado en el catálogo (exclusivo del rubro Agencia
   * de Publicidad — ver ShopPosPage): no hay ShopProduct/ShopVariant detrás, así que name/price/cost
   * se escriben a mano en el momento de la venta en vez de venir de un producto existente. */
  function addAdhocLine(name: string, price: number, cost: number) {
    setCart((prev) => [
      ...prev,
      {
        key: `adhoc-${Date.now()}`,
        productId: '',
        name,
        price,
        cost,
        v1: 'Servicio',
        v2: '',
        qty: 1,
        disc: 0,
        staffUserId: activeStaffUserId || undefined,
      },
    ]);
  }

  /**
   * "Vender plan de consumo": agrega una línea que cobra el paquete completo por adelantado
   * (ej. 50mt × $10 = $500). No es un producto real — no toca stock, porque el cliente todavía
   * no se lleva mercancía, solo el derecho a retirarla después. Tras el pago (ver
   * activateConsumptionPlan en ShopPosPage) esa línea se traduce en un ShopConsumptionPlan.
   */
  function addConsumptionPlanLine(product: ShopProduct, units: number) {
    const rate = product.consumptionPlanRate ?? 0;
    const unidad = product.saleUnit === 'MT' ? 'mt' : product.saleUnit === 'KG' ? 'kg' : 'und';
    setCart((prev) => [
      ...prev,
      {
        key: `plan-new-${Date.now()}`,
        productId: '',
        name: `Plan de consumo — ${product.name} (${units}${unidad})`,
        price: Math.round(rate * units * 100) / 100,
        v1: 'Plan', v2: '',
        qty: 1, disc: 0,
        newPlanProductId: product.id,
        newPlanUnits: units,
      },
    ]);
  }

  /**
   * Marca/quita una línea real del carrito como "con cargo a un plan ya pagado": pone (o quita)
   * el 100% de descuento y guarda el id del plan para descontarle el saldo al cerrar la venta.
   * La línea sigue siendo el producto real, así que el stock se sigue descontando normal.
   */
  function toggleConsumePlan(key: string, planId: string | null) {
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, disc: planId ? 100 : 0, consumePlanId: planId ?? undefined } : c)));
  }

  function updateCartQty(key: string, delta: number) {
    setCart((prev) => prev.flatMap((c) => {
      if (c.key !== key) return [c];
      const qty = c.qty + delta;
      return qty <= 0 ? [] : [{ ...c, qty }];
    }));
  }

  /** Fija la cantidad exacta de una línea (en vez de sumar/restar) — usado por el input de Kg
   * de las líneas por peso, donde el cajero escribe el peso final en vez de incrementarlo de a 1. */
  function setCartQty(key: string, qty: number) {
    setCart((prev) => prev.flatMap((c) => {
      if (c.key !== key) return [c];
      return qty <= 0 ? [] : [{ ...c, qty }];
    }));
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((c) => c.key !== key));
  }

  function setCartLineDiscount(key: string, disc: number) {
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, disc: Math.min(100, Math.max(0, disc)) } : c)));
  }

  function clearCart() {
    setCart([]);
  }

  function openTill(opening: number) {
    setTill({ opening, openedAt: new Date() });
    shopApi.openTill(opening).catch((err) => console.error('No se pudo abrir la caja en el servidor', err));
  }

  /** Cierra la caja y congela el arqueo en closedTills — antes el resumen se perdía apenas se
   * cerraba (no quedaba ningún "informe de caja" para consultar después). */
  function closeTill(counted: number) {
    if (!till) return;
    const salesSinceOpen = sales.filter((s) => !s.returned && s.time >= till.openedAt);
    const totalSales = salesSinceOpen.reduce((a, s) => a + s.total, 0);
    const expected = till.opening + totalSales;
    setClosedTills((prev) => [
      {
        id: `ct${Date.now()}`,
        openedAt: till.openedAt,
        closedAt: new Date(),
        opening: till.opening,
        salesCount: salesSinceOpen.length,
        totalSales,
        expected,
        counted,
        diff: counted - expected,
      },
      ...prev,
    ]);
    setTill(null);
    shopApi.closeTill(counted).catch((err) => console.error('No se pudo cerrar la caja en el servidor', err));
  }

  function checkout(
    paymentMethod: string,
    paymentMeta: PaymentMeta | null,
    customer: { name: string | null; phone: string | null } | null,
    generalDiscountPct: number,
    credit?: { terms: CreditTerms; amountPaidNow: number } | null,
    bankAccountId?: string | null,
    // Promoción del CRM aplicada en el POS: su descuento ya se restó del total que
    // ve el cajero; acá se resta igual y el backend valida el código y registra el canje.
    promo?: { code: string; discountBase: number } | null,
  ): Sale {
    const saleItems: SaleItem[] = cart.map((c) => {
      const product = products.find((p) => p.id === c.productId);
      return {
        productId: c.productId,
        v1: c.v1,
        v2: c.v2,
        name: c.name,
        category: product ? product.category : null,
        qty: c.qty,
        price: effectivePrice(c) * (1 - (c.disc || 0) / 100),
        // Mismo criterio que el precio: costo de la variante si lo tiene. El servidor lo
        // vuelve a resolver al guardar (ver recordSale), esto es para el margen en pantalla.
        cost: c.cost ?? (product ? product.cost : 0),
        soldByWeight: c.soldByWeight,
        detail: c.detail,
        stockQty: c.stockQty,
        staffUserId: c.staffUserId,
        // Mismo cálculo que hace el backend al guardar (ver recordSale): sin esto el reporte por
        // profesional mostraría la venta sin comisión hasta recargar el panel.
        ...(() => {
          if (!c.staffUserId) return {};
          const pct = providers.find((p) => p.id === c.staffUserId)?.commissionPercent ?? 0;
          const gross = effectivePrice(c) * (1 - (c.disc || 0) / 100) * c.qty;
          return { commissionPercent: pct, commissionBase: Math.round((gross * (pct / 100) + Number.EPSILON) * 100) / 100 };
        })(),
      };
    });
    const subtotal = cart.reduce((a, c) => a + lineTotal(c), 0);
    // Se guarda redondeado a céntimos, que es lo que realmente se le cobra al cliente. Con
    // cantidades fraccionadas (Kg, o m² de impresión) el total casi nunca cae en un céntimo
    // exacto — un banner de 1,096 m² a 12 € da 13,152: la pantalla mostraba 13,15 pero se
    // guardaba 13,152, y esa diferencia se iba acumulando en los reportes de ventas.
    const totalBeforePromo = Math.round((subtotal * (1 - generalDiscountPct / 100) + Number.EPSILON) * 100) / 100;
    const promoDiscount = promo ? Math.min(promo.discountBase, totalBeforePromo) : 0;
    const total = Math.round((totalBeforePromo - promoDiscount + Number.EPSILON) * 100) / 100;
    const sale: Sale = {
      id: `s${Date.now()}`,
      items: saleItems,
      total,
      time: new Date(),
      customerName: customer?.name || null,
      customerPhone: customer?.phone || null,
      returned: false,
      paymentMethod,
      paymentMeta,
      creditTerms: credit?.terms ?? null,
      amountPaidNow: credit ? credit.amountPaidNow : null,
      soldByUserId: user?.id ?? null,
      soldByUserName: user?.name ?? null,
    };

    setProducts((prev) => applyStockMovement(prev, cart, serviceSupplies, -1));
    setSales((prev) => [sale, ...prev]);
    setCart([]);

    shopApi
      .recordSale({
        items: saleItems.map((it) => ({ ...it, productId: it.productId || undefined })),
        total,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        paymentMethod: sale.paymentMethod,
        paymentMeta: sale.paymentMeta,
        creditTerms: sale.creditTerms,
        amountPaidNow: sale.amountPaidNow,
        bankAccountId: bankAccountId ?? undefined,
        promoCode: promo?.code,
        promoDiscountBase: promoDiscount || undefined,
      })
      .catch((err) => console.error('No se pudo guardar la venta en el servidor', err));

    return sale;
  }

  /**
   * "Crear venta": registra el cobro de un producto/servicio que TODAVÍA no está en el catálogo,
   * de un tirón (nombre, categoría, costo, precio, método de pago) sin pasar por el carrito. Para
   * el negocio que arranca sin nada cargado en Inventario — puede empezar a vender y cobrar el
   * mismo día. No hay stock que descontar (no hay ShopProduct detrás); si después se agrega al
   * catálogo (ver addProduct, disparado desde el diálogo de seguimiento en ShopPosPage), arranca
   * en 0 y el dueño carga el stock real por separado.
   */
  function quickSale(input: {
    name: string;
    category: string;
    cost: number;
    price: number;
    paymentMethod: string;
    // Pago Móvil pasa por su propia pantalla (QR/referencia/comprobante) antes de llegar acá —
    // ver confirmPagoMovil en ShopPosPage.tsx. Null para el resto de los métodos.
    paymentMeta?: PaymentMeta | null;
    bankAccountId?: string | null;
  }): Sale {
    const saleItems: SaleItem[] = [
      { productId: '', v1: '', v2: '', name: input.name, category: input.category || null, qty: 1, price: input.price, cost: input.cost },
    ];
    const total = Math.round((input.price + Number.EPSILON) * 100) / 100;
    const paymentMeta = input.paymentMeta ?? null;
    const sale: Sale = {
      id: `s${Date.now()}`,
      items: saleItems,
      total,
      time: new Date(),
      customerName: null,
      customerPhone: null,
      returned: false,
      paymentMethod: input.paymentMethod,
      paymentMeta,
      creditTerms: null,
      amountPaidNow: null,
      soldByUserId: user?.id ?? null,
      soldByUserName: user?.name ?? null,
    };
    setSales((prev) => [sale, ...prev]);
    shopApi
      .recordSale({
        items: saleItems.map((it) => ({ ...it, productId: undefined })),
        total,
        customerName: null,
        customerPhone: null,
        paymentMethod: sale.paymentMethod,
        paymentMeta,
        creditTerms: null,
        amountPaidNow: null,
        bankAccountId: input.bankAccountId ?? undefined,
      })
      .catch((err) => console.error('No se pudo guardar la venta en el servidor', err));
    return sale;
  }

  function returnSale(saleId: string) {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale || sale.returned) return;
    setProducts((prev) => applyStockMovement(prev, sale.items, serviceSupplies, 1));
    setSales((prev) => prev.map((s) => (s.id === saleId ? { ...s, returned: true } : s)));
    shopApi.returnSale(saleId).catch((err) => console.error('No se pudo registrar la devolución en el servidor', err));
  }

  function registerPurchase(supplier: string, productId: string, variantIndex: number, qty: number, cost: number, weightKg?: number) {
    const product = products.find((p) => p.id === productId);
    const variant = product?.variants[variantIndex];
    if (!product || !variant) return Promise.resolve();
    // El costo del producto también sube al promedio ponderado, igual que lo hace el servidor
    // (ver shop.service.ts -> recordPurchase). Sin esto el "Stock valorizado" se calculaba con
    // el costo viejo sobre el stock nuevo, y quedaba inflado hasta recargar la página.
    const stockPrevio = product.variants.reduce((a, v) => a + v.stock, 0);
    const stockNuevo = stockPrevio + qty;
    const costoPromedio =
      stockNuevo > 0
        ? Math.round(((product.cost * Math.max(0, stockPrevio) + cost * qty) / stockNuevo) * 10000) / 10000
        : product.cost;
    setProducts((prev) => prev.map((p) => (p.id !== productId ? p : {
      ...p,
      cost: costoPromedio,
      variants: p.variants.map((v, i) => (i === variantIndex ? { ...v, stock: v.stock + qty } : v)),
    })));
    setPurchases((prev) => [
      { id: `pu${Date.now()}`, supplier, productName: product.name, v1: variant.v1, v2: variant.v2, qty, cost, weightKg, time: new Date() },
      ...prev,
    ]);
    // Se devuelve la promesa para que quien registre la compra pueda refrescar lo que dependa
    // del servidor (los lotes del producto) recién cuando el lote quedó guardado de verdad.
    return (async () => {
      try {
        const realProductId = await resolveServerProductId(productId);
        await shopApi.recordPurchase({ supplier, productId: realProductId, v1: variant.v1, v2: variant.v2, qty, cost, weightKg });
      } catch (err) {
        console.error('No se pudo guardar la compra en el servidor', err);
      }
    })();
  }

  /** Corrige el stock de una variante a la cantidad realmente contada (recuento físico /
   * auditoría) — a diferencia de registerPurchase, no suma: fija el valor y registra la
   * diferencia para poder auditar después qué se ajustó y por qué. */
  function adjustStock(productId: string, variantIndex: number, counted: number, reason: string) {
    const product = products.find((p) => p.id === productId);
    const variant = product?.variants[variantIndex];
    if (!product || !variant) return;
    const before = variant.stock;
    setProducts((prev) => prev.map((p) => (p.id !== productId ? p : {
      ...p,
      variants: p.variants.map((v, i) => (i === variantIndex ? { ...v, stock: counted } : v)),
    })));
    setAdjustments((prev) => [
      {
        id: `adj${Date.now()}`,
        productId,
        productName: product.name,
        v1: variant.v1,
        v2: variant.v2,
        before,
        after: counted,
        diff: counted - before,
        reason: reason.trim() || 'Recuento físico',
        time: new Date(),
      },
      ...prev,
    ]);
    (async () => {
      try {
        const realProductId = await resolveServerProductId(productId);
        await shopApi.recordAdjustment({ productId: realProductId, v1: variant.v1, v2: variant.v2, counted, reason: reason.trim() || 'Recuento físico' });
      } catch (err) {
        console.error('No se pudo guardar el ajuste de stock en el servidor', err);
      }
    })();
  }

  function addProduct(input: NewProductInput): ShopProduct {
    const tempId = `np${Date.now()}`;
    const product: ShopProduct = { id: tempId, ...input };
    setProducts((prev) => [...prev, product]);
    addCategory(input.category);
    if (input.subcategory) addSubcategory(input.category, input.subcategory);

    const created = shopApi
      .createProduct(input)
      .then((raw) => {
        const serverProduct = toShopProduct(raw);
        setProducts((prev) => prev.map((p) => (p.id === tempId ? serverProduct : p)));
        return raw.id;
      })
      .catch((err) => {
        console.error('No se pudo guardar el producto en el servidor', err);
        return tempId;
      });
    pendingProductIds.current.set(tempId, created);

    return product;
  }

  /** Permite corregir precio/costo/categoría/ubicación/variantes de un producto ya guardado —
   * hasta ahora Inventario solo dejaba crear productos nuevos, sin forma de editar uno existente. */
  function updateProduct(id: string, input: NewProductInput) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...input } : p)));
    addCategory(input.category);
    if (input.subcategory) addSubcategory(input.category, input.subcategory);

    (async () => {
      try {
        const realId = await resolveServerProductId(id);
        await shopApi.updateProduct(realId, input);
      } catch (err) {
        console.error('No se pudo actualizar el producto en el servidor', err);
      }
    })();
  }

  /**
   * Publica o quita productos del catálogo público de la tienda virtual. Acepta varios de una
   * porque encender la vitrina producto por producto no es viable en un local con cientos.
   *
   * Si el servidor rechaza el cambio se revierte en pantalla: dejar los productos "publicados"
   * localmente haría creer que la tienda ya los muestra cuando no.
   */
  function setProductsPublished(ids: string[], isPublished: boolean) {
    const affected = new Set(ids);
    const previous = products;
    setProducts((prev) => prev.map((p) => (affected.has(p.id) ? { ...p, isPublished } : p)));

    (async () => {
      try {
        const realIds = await Promise.all(ids.map((id) => resolveServerProductId(id)));
        await shopApi.setProductsPublished(realIds, isPublished);
      } catch (err) {
        console.error('No se pudo actualizar la vitrina en el servidor', err);
        setProducts(previous);
      }
    })();
  }

  /**
   * Saca un producto del inventario. El historial de ventas/compras no se toca: guarda su
   * propio nombre y precio del momento, así que sigue cuadrando aunque el producto ya no exista.
   * Si el borrado falla en el servidor, se repone en la lista para no mentirle al usuario.
   */
  function deleteProduct(id: string) {
    const removed = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setServiceSupplies((prev) => prev.filter((s) => s.serviceProductId !== id && s.supplyProductId !== id));

    (async () => {
      try {
        const realId = await resolveServerProductId(id);
        await shopApi.deleteProduct(realId);
      } catch (err) {
        console.error('No se pudo eliminar el producto en el servidor', err);
        if (removed) setProducts((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, removed]));
      }
    })();
  }

  /** Vuelve a traer el estado del backend. Lo usa el aumento general de precios: cambia el
   *  catálogo entero de un golpe y no tiene sentido reconstruirlo a mano. */
  async function reload() {
    const state = await shopApi.getState();
    setProducts(state.products.map(toShopProduct));
  }

  return {
    loading,
    reload,
    products,
    sales,
    purchases,
    cart,
    till,
    closedTills,
    adjustments,
    categories,
    subcategories,
    addCategory,
    addSubcategory,
    addToCart,
    addAdhocLine,
    addPrintLine,
    serviceSupplies,
    setServiceSupplies,
    quickSale,
    providers,
    activeStaffUserId,
    setActiveStaffUserId: selectActiveStaff,
    updateCartQty,
    setCartQty,
    removeFromCart,
    setCartLineDiscount,
    clearCart,
    addConsumptionPlanLine,
    toggleConsumePlan,
    // Reemplaza el carrito completo: lo usa "Pedidos abiertos" para devolver a la pantalla de
    // venta un carrito guardado antes, tal como quedó.
    reemplazarCarrito: setCart,
    openTill,
    closeTill,
    checkout,
    returnSale,
    registerPurchase,
    adjustStock,
    addProduct,
    updateProduct,
    setProductsPublished,
    deleteProduct,
  };
}

export type ShopSession = ReturnType<typeof useShopSession>;

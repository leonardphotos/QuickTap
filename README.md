# QuickTap.club — Backend

SaaS **multi-inquilino** para restaurantes: menú digital por QR, comandas en mesa en tiempo real (WebSockets → ticketera térmica) y checkout de delivery vía **WhatsApp**.

> Stack: **Node.js + TypeScript + Express + PostgreSQL (Prisma ORM) + Socket.IO**

---

## 🏛️ Arquitectura y aislamiento por inquilino

El modelo es **shared database / shared schema**: todas las tablas de dominio
cuelgan de `restaurantId`. El aislamiento se garantiza en tres capas:

1. **Middleware `authGuard`** → deriva el `restaurantId` **desde el JWT**, nunca del body/params.
2. **Servicios** → toda query filtra por `restaurantId` (y valida pertenencia de relaciones, ej. la categoría de un producto).
3. **Índices compuestos** `@@index([restaurantId, ...])` → rendimiento aislado por tenant.

Los canales públicos (menú y checkout) resuelven el tenant por **`slug`** (menú/delivery) o por el **`qrToken`** de la mesa (dine-in), sin exponer IDs internos.

---

## 📁 Estructura de carpetas

```
QuickTap/
├── prisma/
│   ├── schema.prisma          # Esquema de BD (tenants, catálogo, mesas, comandas)
│   └── seed.ts                # Datos de demostración
├── src/
│   ├── server.ts              # Entrypoint: HTTP + Socket.IO + apagado ordenado
│   ├── app.ts                 # App Express (helmet, cors, rutas, errores)
│   ├── config/
│   │   ├── env.ts             # Config tipada desde .env (falla rápido)
│   │   └── prisma.ts          # Cliente Prisma singleton
│   ├── middlewares/
│   │   ├── auth.middleware.ts # JWT → req.restaurantId (tenant activo)
│   │   └── error.middleware.ts# Zod / Prisma / HttpError → JSON
│   ├── sockets/
│   │   └── index.ts           # Gateway WS, rooms `kitchen:<restaurantId>`
│   ├── utils/
│   │   ├── money.ts           # Decimales, conversión USD→Bs, formato
│   │   ├── whatsapp.ts        # buildWhatsappCheckoutUrl() (wa.me + encodeURIComponent)
│   │   └── http-error.ts      # Errores HTTP tipados
│   ├── modules/
│   │   ├── products/          # CRUD de productos (banderas de marketing)
│   │   ├── menu/              # Menú público optimizado por slug
│   │   └── orders/           # Checkout Mesa (WS) y Delivery (WhatsApp)
│   └── routes/
│       └── index.ts           # Enrutador raíz /api/v1
├── .env.example
├── tsconfig.json
└── package.json
```

---

## 🗄️ Modelo de datos (resumen)

| Modelo | Rol |
|--------|-----|
| `Restaurant` | Tenant: `slug` único, `baseCurrency` (`USD`\|`EUR`, elegido por el restaurante), `whatsappPhone`. |
| `ExchangeRate` | Tasa BCV **global** (no por inquilino), una fila por moneda (`USD`/`EUR`) con `rateBs` + `fetchedAt`. |
| `User` | Dueño/personal. Email único **por restaurante**. |
| `Category` | Ordenadas por `priority`. |
| `Product` | Precio (en la `baseCurrency` del restaurante), foto, disponibilidad + banderas `isStar` (Estrella), `isPromo` (Promoción), `isHouseSpecial` (Recomendación de la Casa). |
| `Table` | Mesa con `number` y `qrToken` (opaco, embebido en el QR). |
| `Order` | Estado (`PENDING`/`KITCHEN`/`SERVED`/`CANCELLED`), canal (`DINE_IN`/`DELIVERY`/`PICKUP`), `currency`, snapshot de totales (`subtotalBase`/`totalBase`) + `exchangeRate`/`totalBs` congelados al momento de la compra. |
| `OrderItem` | Snapshot de nombre/precio + `modifiers[]` y `note` (notas de cocina). |

---

## 🔌 Endpoints principales

### Panel (requieren `Authorization: Bearer <jwt>`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET/POST` | `/api/v1/products` | Listar / crear productos. |
| `GET/PATCH/DELETE` | `/api/v1/products/:id` | Ver / actualizar / borrar. |
| `GET` | `/api/v1/orders/kitchen` | Cola de comandas de cocina. |
| `PATCH` | `/api/v1/orders/:id/status` | Cambiar estado de comanda. |
| `PATCH` | `/api/v1/restaurant` | Configuración del restaurante, incluye `baseCurrency` (la "casilla de Tasa cambiaria": $ o €). |
| `GET` | `/api/v1/exchange-rates` | Tasa BCV vigente para USD y EUR (valor, fecha, si está desactualizada). |
| `POST` | `/api/v1/exchange-rates/refresh` | Fuerza un refresco manual contra la fuente BCV. |

### Público (QR / cliente)
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/public/menu/:slug` | Menú estructurado por categorías + `highlights` (estrellas, promos, recomendaciones). |
| `POST` | `/api/v1/public/checkout/dine-in` | Comanda en mesa → guarda + emite WS a cocina. |
| `POST` | `/api/v1/public/checkout/delivery/:slug` | Guarda comanda + devuelve `whatsappUrl`. |

---

## 🍽️ Flujos de checkout

**Mesa (DINE_IN):** el body lleva `qrToken` + `items`. El servicio resuelve la mesa/tenant desde el token, **congela los precios desde la BD**, guarda la orden en estado `KITCHEN` y emite `order:new` a la room `kitchen:<restaurantId>` → el panel de cocina imprime en la ticketera.

**Delivery (WhatsApp):** el body lleva `mode`, `items` y `customer` (nombre, dirección, `paymentMethod`: Pago Móvil/Zelle/Efectivo/Tarjeta, nota). Se guarda la orden y `buildWhatsappCheckoutUrl()` retorna una URL `https://wa.me/<phone>?text=<encodeURIComponent(msg)>` con el pedido formateado (total en Bs primero, equivalente en $/€, modificadores y notas).

---

## 💱 Tasa de cambio (BCV)

Los precios de los productos se cargan en la moneda que elige cada restaurante (`baseCurrency`: **USD** o **EUR**, casilla "Tasa cambiaria" en `/admin/settings`). Al público **siempre se le muestra el precio en bolívares** (con el precio base como referencia secundaria), calculado con la tasa oficial del Banco Central de Venezuela.

- La tasa es **global**, no por restaurante: se cachea en la tabla `ExchangeRate` (una fila por moneda) y todos los restaurantes que facturan en esa moneda la comparten.
- `src/modules/exchange-rate/exchange-rate.service.ts` la refresca automáticamente al arrancar el servidor y luego cada `EXCHANGE_RATE_TTL_HOURS` (por defecto 6h) contra `EXCHANGE_RATE_USD_URL`/`EXCHANGE_RATE_EUR_URL` (por defecto, endpoints de dolarapi.com que replican el dato oficial del BCV).
- **Diseño a prueba de fallos:** si la fuente externa no responde, se sigue usando la última tasa cacheada — el checkout nunca se rompe por eso. El dashboard (`/admin/settings`) muestra si la tasa está desactualizada y permite forzar un refresco manual.
- Cada `Order` congela la tasa y el monto en Bs aplicados al momento de la compra (no cambian retroactivamente si la tasa BCV se actualiza después).

> Nota: en este entorno de desarrollo la llamada saliente al proveedor de la tasa está bloqueada por la política de red del sandbox, así que se sembró una tasa de respaldo (`source: "SEED"`) para poder probar el flujo completo. En un despliegue real con salida a internet, el refresco automático la reemplaza.

---

## ⚡ WebSockets

- Cliente se conecta con `io(url, { auth: { token: '<jwt>' } })`.
- El servidor lo une automáticamente a `kitchen:<restaurantId>`.
- Eventos emitidos: `order:new` (nueva comanda), `order:updated` (cambio de estado).

---

## 🚀 Puesta en marcha

```bash
cp .env.example .env          # configura DATABASE_URL, JWT_SECRET...
npm install
npm run prisma:migrate        # crea las tablas
npm run prisma:seed           # datos de demo (opcional)
npm run dev                   # http://localhost:4000
```

Prueba el menú público de la semilla: `GET /api/v1/public/menu/la-parrilla-de-juan`

---

## 🌐 Frontend (`/web`)

Vite + React + TypeScript + Tailwind v4 + React Router + Socket.IO client.

```bash
cd web
npm install
npm run dev   # http://localhost:3000 (proxea /api y /socket.io hacia :4000)
```

- **`/r/:slug`** — menú público. Con `?mesa=<qrToken>` es el flujo de mesa (checkout directo a cocina); sin ese parámetro es delivery/pickup (genera el link de WhatsApp).
- **`/admin/register` · `/admin/login`** — alta de restaurante y login.
- **`/admin/kitchen`** — cola de cocina en vivo (Socket.IO).
- **`/admin/products` · `/admin/categories` · `/admin/tables`** — CRUD del panel; Mesas genera el QR (SVG) apuntando a `/r/:slug?mesa=...`.
- **`/admin/settings`** — casilla de "Tasa cambiaria" (elegir $ o €), tasa BCV vigente + refresco manual, WhatsApp del restaurante.

## 🧭 Próximos pasos (fuera del alcance de este scaffold)

- Subida de imágenes (S3/Cloudinary) para `photoUrl`/`logoUrl`.
- Generación de PDF/impresión física de los QR y agente de impresión térmica (ESC/POS).
- Rate limiting en endpoints públicos.
- Deploy (dominio `quicktap.club`, HTTPS, variables de entorno de producción).

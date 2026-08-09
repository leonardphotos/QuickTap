# Vertical Club (Canchas de Pádel) — Arquitectura

Tercer rubro de QuickTap, junto a Restaurantes (`RESTAURANT`) y Locales (`SHOP`).
Documento de diseño: qué se reutiliza, qué se construye nuevo, y en qué orden.

---

## 0. Las cuatro decisiones que definen todo lo demás

### 0.1 El doble booking se previene en la base de datos, no en el servicio

Es *la* decisión técnica del proyecto. Una validación en el servicio
(`buscar reservas solapadas → si no hay, crear`) **no sirve**: dos jugadores que
pulsan "reservar" en el mismo segundo pasan ambos la comprobación y ambos
insertan. En un restaurante eso es una molestia; en una cancha es el cliente
llegando a las 7pm y encontrando la pista ocupada.

PostgreSQL 16 con `btree_gist` (verificado disponible en el VPS) resuelve esto
de forma atómica:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE club_court_blocks
ADD CONSTRAINT club_court_blocks_no_overlap
EXCLUDE USING gist (
  "courtId"                              WITH =,
  tstzrange("startsAt", "endsAt", '[)')  WITH &&
) WHERE (status <> 'CANCELLED');
```

El rango es **semiabierto** `[)`: una reserva de 18:00–19:00 y otra de
19:00–20:00 no se solapan. Prisma no genera esto, se agrega como SQL crudo
dentro de la migración.

### 0.2 Un solo modelo para todo lo que ocupa una cancha

Reservas, bloqueos de mantenimiento, clases de academia y partidos de torneo son
todos *lo mismo* desde el punto de vista del calendario: un intervalo de tiempo
sobre una cancha. Modelarlos en cuatro tablas obliga a repetir la lógica de
solapamiento cuatro veces — y garantiza que tarde o temprano un bloqueo por
lluvia no valide contra una reserva ya hecha.

Por eso hay **una sola tabla `ClubCourtBlock`** con un discriminador `kind`
(`BOOKING | MAINTENANCE | CLASS | TOURNAMENT`). Una restricción protege todo, y
el calendario es una sola consulta. Los datos propios de cada tipo cuelgan en
tablas satélite (`ClubBooking`, `ClubClassSession`, …) que apuntan al bloque.

### 0.3 El dinero va en `Decimal`, y el split reparte céntimos exactos

Locales guarda dinero en `Float` (`schema.prisma:2048-2181`). Para una tienda de
mostrador se tolera; para pagos divididos **no**, y conviene no repetir el error.

El problema concreto: $40 entre 3 jugadores da 13,333… Si se redondea cada parte
a 13,33 la suma es 39,99 y **la reserva nunca llega a "pagada"** — queda colgada
para siempre reclamando un céntimo. El reparto tiene que truncar a céntimos y
repartir el resto de uno en uno entre las primeras partes:

```
40,00 / 3  →  13,34 + 13,33 + 13,33  =  40,00 ✓
```

Determinista, auditable, y la suma cierra siempre. Todo el vertical usa
`Decimal @db.Decimal(12,2)`.

### 0.4 El QR de acceso reutiliza el patrón de las mesas, tal cual

`Table.qrToken` ya resuelve exactamente este problema: token opaco `nanoid`,
único, que autentica sin JWT contra rutas públicas y contra una sala de socket
propia. `ClubBooking.accessToken` copia el patrón. No se inventa nada.

El QR **no codifica** datos de la reserva, solo el token; el servidor resuelve y
valida. Al escanearse marca `checkedInAt`, que es justamente lo que después
permite detectar ausencias sin pedirle nada a nadie.

---

## 1. Qué se reutiliza (verificado en el código)

| Pieza | Estado | Nota |
|---|---|---|
| Tasa de cambio + **tasa manual del día** | ✅ tal cual | `Restaurant.exchangeRateManual` + `manualExchangeRateBs` ya existen. El requisito "campo central para fijar la tasa del día" **ya está construido**. |
| `PaymentMethod` (Zelle, Pago Móvil, Punto de venta, Efectivo Bs/USD, Binance…) | ✅ tal cual | Enum + `paymentMethodsConfig` por tenant. Cubre todo lo pedido. |
| `Movement` / `Supplier` / gastos / cuentas por pagar | ✅ tal cual | Sin FK a `Order`, genérico. Incluye recibo, fecha real y crédito a proveedor. |
| Token opaco QR + sala de socket privada | ✅ patrón | Ver §0.4. |
| WhatsApp `sendMessage` / `sendImage` | ✅ tal cual | Notificar confirmación y recordatorio al jugador no requiere código nuevo. |
| `Customer` (upsert por teléfono, único por tenant) | ✅ base | Es la identidad del jugador. Le falta el historial (§2.6). |
| Sockets (`kitchen:<restaurantId>` = bus del tenant) | ✅ tal cual | Sirve para refrescar el calendario de recepción en vivo. |
| **Pro-Shop / POS de tienda** | ✅ **reutilización mayor** | `ShopProduct` / `ShopSale` / `ShopSalePayment` ya hacen POS, variantes, stock mínimo, compras a proveedor y ventas a crédito. No están limitados por `businessType`. La tienda del club es **integración de UI, no backend nuevo**. |
| `CashSession` (arqueo) | 🟡 adaptar | El modelo es genérico y congela `closingSummary` en Decimal. Solo `computeSummary` está atado a `OrderPayment`: hay que hacerle la fuente de ingresos inyectable. **No** crear un tercer modelo de caja (Locales lo hizo y perdió el snapshot congelado). |
| Comisiones | ✅ patrón | `ShopSaleItem.commissionPercent`/`commissionBase` congelados al vender, leídos de `User.commissionPercent`. Se copia igual para el profesor. |
| `Reservation` (reservas de restaurante) | ❌ no sirve | Sin duración ni hora de fin, **sin detección de solapamiento**, sin calendario y sin notificaciones. Se reutiliza el esqueleto de rutas público/tenant, nada más. |
| `PromoCode` | ❌ no sirve | Es descuento sobre la suscripción a QuickTap, no tiene `restaurantId`. Las promos del club se construyen. |
| Vuelto en efectivo | ❌ no existe | El cobro actual rechaza montos que excedan el saldo. Hay que construirlo. |

---

## 2. Modelo de datos nuevo

Prefijo `Club*` (no `Padel*`): un club de pádel suele terminar con una pista de
tenis o fútbol 5, y `ClubCourt.sport` cubre eso sin costo. Convención igual a
`Shop*`, tablas `@@map("club_*")`, todo con `restaurantId` + `onDelete: Cascade`
+ `@@index([restaurantId, …])`.

### 2.1 Canchas y disponibilidad

```
ClubCourt          id, restaurantId, name, sport(PADEL|TENIS|FUTBOL…),
                   indoor, active, sortOrder

ClubSchedule       franjas de apertura por día de semana + precio
                   restaurantId, courtId?, weekday(0-6), startTime, endTime,
                   pricePerSlotBase, slotMinutes(60|90), isPeak
                   → courtId null = aplica a todas las canchas
                   → "hora pico/valle" es simplemente otra franja con otro precio

ClubCourtBlock     ⭐ tabla central del calendario
                   id, restaurantId, courtId, kind(BOOKING|MAINTENANCE|CLASS|TOURNAMENT),
                   startsAt, endsAt, status(ACTIVE|CANCELLED), note
                   → EXCLUDE constraint (§0.1)
```

### 2.2 Reservas y pago dividido

```
ClubBooking        blockId(unique), restaurantId, customerId?, playerName, playerPhone,
                   totalBase, exchangeRate, totalBs   ← congelados al reservar
                   accessToken(unique, nanoid)        ← QR
                   checkedInAt?, noShow(bool)
                   status(PENDING_PAYMENT|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW)

ClubBookingShare   una fila por jugador (normalmente 4)
                   bookingId, label, amountBase, status(PENDING|PAID|WAIVED),
                   payToken(unique)  ← enlace individual de pago
                   paidAt?, paymentMethod?, referenceNumber?, proofImageUrl?

ClubBookingPayment bookingId, shareId?, amountBase, amountBs, method,
                   referenceNumber?, proofImageUrl?, receivedByUserId?, createdAt
```

`totalBase` y `exchangeRate` se congelan igual que en `Order`: si mañana sube la
tasa o el precio de la hora pico, una reserva ya hecha no cambia de precio.

### 2.3 Mantenimiento

Es un `ClubCourtBlock` con `kind = MAINTENANCE` y `note` ("cristales", "lluvia",
"cambio de red"). Al compartir tabla con las reservas, la restricción de la §0.1
**impide crear un bloqueo sobre una reserva existente y viceversa**, gratis.

### 2.4 Academia, bonos y membresías

```
ClubProgram        academia/escuela: name, coachUserId?, priceBase, billingDay
ClubEnrollment     programId, customerId, status, startsAt, endsAt?
ClubClassSession   blockId, programId, coachUserId,
                   commissionPercent, commissionBase   ← congelados al impartir
ClubAttendance     classSessionId, customerId, present

ClubPass           bono de horas: customerId, totalCredits, expiresAt, priceBase
ClubPassEntry      libro mayor: passId, delta(+/-), bookingId?, reason, createdAt
                   → el saldo se SUMA, nunca se guarda como contador mutable
```

El libro mayor de bonos sigue el mismo principio que el resto del sistema (el
bloqueo por suscripción se calcula en vivo, nunca se persiste como booleano):
un saldo derivado no se desincroniza y deja auditoría de en qué se gastó cada hora.

### 2.5 Torneos

```
ClubTournament     name, format(AMERICANO|MEXICANO|ELIMINACION), date, feeBase
ClubTournamentTeam tournamentId, playerAName, playerBName, customerId?
ClubTournamentMatch tournamentId, round, teamAId, teamBId, blockId?, scoreA, scoreB
```

`blockId` opcional ata el partido a una cancha y hora → el torneo ocupa el
calendario como cualquier otra cosa y no se puede reservar encima.

### 2.6 CRM

Se agrega a `Customer` lo que hoy le falta: la relación con su consumo.
`ClubBooking.customerId` + `ShopSale.customerId` dan el historial completo
(cancha + tienda). Ausencias: `noShow` sale solo de comparar `checkedInAt` con el
fin del bloque — no hay que marcarlo a mano.

Analíticas (consultas, no tablas): mapa de calor ocupación por hora × día,
rentabilidad por área (cancha / academia / tienda), y filtro de inactivos
(clientes sin reserva en N días) para reactivación.

---

## 3. Cableado de la vertical

Siguiendo exactamente el patrón de Locales:

**Backend**
1. `BusinessType.SPORTS_CLUB` y `SubscriptionPlan.CLUB` en `schema.prisma`.
2. `auth.dto.ts` / `auth.service.ts` — aceptar el tipo en el registro y asignar
   su plan de prueba; exponer `businessType` en la sesión.
3. `src/utils/subscription.ts` **y su espejo en `web/`** — el plan `CLUB`
   devuelve `true` en `hasFeature` (si no, Gastos y Proveedores dan 403; es
   exactamente el bug que tuvo Locales).
4. `src/modules/club/` — `.routes.ts` / `.controller.ts` / `.dto.ts` / `.service.ts`.
5. `src/routes/index.ts` — montar `/club` (tenant) y `/public/club` (jugador).

**Frontend**
1. `AuthContext.tsx:27` — ampliar el union de `businessType`.
2. `AdminLayout.tsx:85` — un `if` más, **antes** de `canAccessPath`.
3. `StartRegisterPage.tsx` — tercera opción (ya existe `warehouse` deshabilitada
   como plantilla).
4. `web/src/pages/admin/club/` — `ClubLayout.tsx` + `useClubSession` +
   `clubApi.ts`, páginas tontas que reciben `session` por props.

**Higiene, no vulnerabilidad:** hoy no existe `requireBusinessType`, así que un
token de restaurante puede llamar `/api/v1/shop/*`. No hay fuga entre tenants
(el `restaurantId` sale del token, vería su propio local vacío), pero conviene
añadir el guard al crear la vertical nueva.

---

## 4. Roles

Los roles pedidos mapean sobre los existentes; no hace falta ampliar el enum:

| Rol del club | Rol QuickTap | Alcance |
|---|---|---|
| Administrador | `OWNER` / `ADMIN` | Todo |
| Recepción | `CASHIER` | Calendario, POS, escáner QR, caja |
| Entrenador | `WAITER` (reetiquetado) | Solo su agenda y asistencia |

Igual que `ShopTeamSection` recorta la lista de roles asignables, `ClubTeamSection`
mostrará estos tres con sus nombres de club.

---

## 5. Fases

Cada fase deja algo usable, no un trozo a medias.

| # | Fase | Contenido | Depende de |
|---|---|---|---|
| **0** | Fundación | `businessType`, plan, registro, layout vacío navegable | — |
| **1** | **Motor de reservas** | `ClubCourt`, `ClubSchedule`, `ClubCourtBlock` + restricción, consulta de disponibilidad, calendario de recepción, bloqueos de mantenimiento | 0 |
| **2** | Jugador + QR | Reserva pública por `slug`, confirmación, QR de acceso, escáner y check-in, ausencias | 1 |
| **3** | Dinero | Split payment, cobro, arqueo por turno obligatorio, multimoneda, **vuelto** | 2 |
| **4** | Pro-Shop | Integrar el POS de Locales al layout del club | 0 |
| **5** | Academia y torneos | Programas, bonos, membresías, comisiones, cuadros | 3 |
| **6** | CRM y analítica | Mapa de calor, rentabilidad por área, no-shows, reactivación | 2, 3 |

La Fase 1 es el producto. Un club puede operar con Fases 0–3; el resto es
expansión.

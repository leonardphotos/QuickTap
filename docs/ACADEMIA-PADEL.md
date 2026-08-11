# Módulo Academia de Pádel — Arquitectura

Extensión del vertical Club (`SPORTS_CLUB`). Ver `docs/PADEL-ARQUITECTURA.md`:
este documento asume sus cuatro decisiones fundacionales y detalla la Fase 5
(«Academia y torneos») que aquel dejó esbozada en §2.4.

Objetivo: gestionar cursos, entrenadores, alumnos y cobros **sin generar
conflictos con la parrilla de alquiler libre**.

---

## 0. Las seis decisiones que definen el módulo

### 0.1 Una clase es un `ClubCourtBlock`, no una tabla nueva de calendario

`ClubBlockKind` ya tiene el valor `CLASS` (`schema.prisma:2704`) y
`getAvailability` ya lo devuelve como `reason: 'CLASS'`
(`club.service.ts:113,249`). La restricción `club_court_blocks_no_overlap` ya
protege ese bloque contra cualquier otro.

**Consecuencia directa:** el requisito «sin conflictos con el alquiler libre» no
se implementa — *ya está implementado*. Una clase creada sobre una cancha la
saca de la parrilla pública en la misma consulta que ya corre, y un jugador que
intente reservar ese hueco choca contra la restricción de PostgreSQL, no contra
un `if`. No se escribe ni una línea de lógica de solapamiento nueva.

Lo único que se añade es la tabla satélite `ClubClassSession`, que cuelga del
bloque igual que `ClubBooking` cuelga del suyo.

### 0.2 La generación de sesiones recurrentes puede fallar parcialmente, y eso es correcto

Al crear un grupo que se repite lunes y miércoles durante un trimestre, algunas
de esas fechas **ya van a tener una reserva libre encima**. La restricción va a
rechazar esos INSERT.

La reacción ingenua —abortar toda la generación— es la peor: deja al club sin
poder abrir un grupo porque dentro de dos meses hay una reserva suelta. La otra
reacción ingenua —cancelar la reserva del jugador para meter la clase— es peor
todavía.

**Decisión:** se genera ocurrencia por ocurrencia; la que choca se guarda como
`ClubClassSession` con `blockId = null` y `status = NEEDS_COURT`, y el admin
recibe la lista («3 fechas chocan con reservas ya hechas: 14/9, 21/9, 5/10»)
para resolverlas a mano (mover de cancha, mover de hora, o cancelar esa fecha).

Esto obliga a que **`blockId` sea nullable** en `ClubClassSession`. Es la
diferencia con `ClubBooking`, donde es obligatorio: una reserva sin cancha no
existe, pero una clase sin cancha sí — es una clase que hay que reubicar.

### 0.3 El horizonte de generación es corto y se extiende solo

Generar seis meses de bloques al crear el grupo congelaría la parrilla entera:
el club no podría vender alquiler libre a tres meses porque la academia ya se
comió la rejilla, para grupos que quizá no se llenen.

**Decisión:** `ACADEMY_HORIZON_WEEKS = 8`. La extensión es perezosa, disparada
al cargar el calendario o el panel de academia — el mismo patrón de
`settlePastBookings` (`club.service.ts:490`), que este proyecto ya prefiere
sobre un cron.

### 0.4 El saldo de fichas se SUMA de un libro mayor, nunca se guarda como contador

Mismo principio que el bloqueo por suscripción (`src/utils/subscription.ts`,
calculado en vivo, jamás persistido como booleano) y que el `ClubPass` planteado
en `PADEL-ARQUITECTURA.md:161`.

`ClubClassCreditEntry` es un libro mayor de `delta` (+/-). El saldo es
`SUM(delta)`. Un contador mutable se desincroniza en el primer error de red a
mitad de una transacción y deja al alumno con clases que pagó y no puede usar —
y sin forma de auditar dónde se perdieron.

**Incluida la caducidad:** un bono vencido no se filtra por fecha al leer, se
barre escribiendo una entrada negativa `EXPIRED`. Así el saldo siempre es una
suma plana sin lógica de fechas repartida por diez consultas, y el vencimiento
queda auditable.

### 0.5 Cada asistencia carga el dinero que consumió

`ClubAttendance.consumedValueBase` — congelado al pasar lista.

Es la columna que hace que todo lo demás salga solo. Un alumno puede llegar a
una misma sesión por tres vías distintas (mensualidad, ficha de un lote, pago
suelto), y sin esta columna cada reporte tendría que reconstruir a posteriori
cuánto valía esa silla:

- **Honorario por comisión del profesor** = `commissionPercent` × suma de los
  `consumedValueBase` presentes en su sesión.
- **Rentabilidad por grupo/sesión** = ingreso de la sesión − honorario del
  profesor − hora de cancha.
- **Ingreso de la academia** en el arqueo, sin depender de a qué mes se imputó
  la mensualidad.

Para la mensualidad el valor por clase es `priceBase / sesionesEsperadasDelMes`,
calculado y congelado al pasar lista. No es exacto al céntimo contra la
mensualidad cobrada, y no importa: es una **imputación de costo**, no un cobro.
El cobro real vive en `ClubAcademyPayment`.

### 0.6 El profesor es una entidad propia, no un `User` ni un `Employee`

Tres razones concretas, no purismo:

1. Muchos clubes tienen profesores que **nunca inician sesión** (el admin pasa
   lista). Forzar un `User` obliga a crear credenciales para gente que no las
   quiere.
2. El aviso por WhatsApp necesita un teléfono **aunque no haya cuenta**.
3. El profesor cobra por nómina, que ya existe (`Employee` / `EmployeePayment`,
   módulo `src/modules/payroll/`). Duplicar ahí la identidad rompería el arqueo.

`ClubCoach` tiene `userId?` (portal, opcional) y `employeeId?` (nómina,
opcional). La identidad del profesor sobrevive a que se le borre el login o se
le saque de la nómina — y sus sesiones históricas siguen atribuidas.

---

## 1. Qué se reutiliza (verificado en el código)

| Pieza | Estado | Nota |
|---|---|---|
| `ClubCourtBlock` + restricción EXCLUDE | ✅ tal cual | §0.1. `kind = CLASS` ya existe. |
| `getAvailability` / `getCalendar` | ✅ tal cual | Ya excluyen bloques `CLASS`. Cero cambios. |
| `Customer` (identidad por teléfono) | ✅ base | El alumno **es** un `Customer`. Ver §2.4. |
| `whatsappBotService.sendMessage` | ✅ tal cual | `whatsapp-bot.service.ts:471`. Aviso al profesor. |
| `Employee` + `EmployeePayment` + `Movement` | ✅ tal cual | Pago de honorarios = gasto de nómina, ya construido. |
| `User.commissionPercent` | ✅ patrón | `schema.prisma:641`. Se copia el criterio de congelar la comisión al momento. |
| `CashSession` / arqueo | 🟡 **tocar** | `collectPayments` necesita una cuarta fuente. §7.1. Es el punto de integración crítico. |
| Token opaco `nanoid` + ruta pública | ✅ patrón | `ClubBooking.accessToken`. El portal del alumno lo copia. |
| `PaymentMethod` + `paymentMethodsConfig` | ✅ tal cual | Cobros de academia sin enum nuevo. |
| `ClubPass` / `ClubPassEntry` | ⬜ no existe | Planeado para horas de cancha. **No** se reutiliza para clases: ver §2.6. |
| `PlanRequest` (aprobación manual de pago) | ✅ patrón | La mensualidad del alumno copia el flujo, no el código. |

---

## 2. Modelo de datos (requisito 1)

Prefijo `ClubClass*` / `ClubCoach*` / `ClubStudent*`. Todo con `restaurantId`,
`onDelete: Cascade`, `@@index([restaurantId, …])` y `@@map("club_*")`, igual que
el resto del vertical.

### 2.1 Niveles (1.0 – 6.0)

`Decimal @db.Decimal(2,1)`, no un enum.

Un enum de once valores (`L1_0`, `L1_5`, …) haría imposible la consulta que de
verdad importa —«qué grupos admiten a un alumno de 3.5»— sin un mapa de orden
paralelo. Con `Decimal` es `levelMin <= 3.5 AND levelMax >= 3.5`, resuelto por
el índice.

```
ClubStudent.level        Decimal(2,1)?   nivel actual del alumno
ClubClassGroup.levelMin  Decimal(2,1)    1.0 … 6.0
ClubClassGroup.levelMax  Decimal(2,1)
```

Validación en el DTO: múltiplo de 0.5 dentro de [1.0, 6.0].

### 2.2 Entrenadores

```
ClubCoach            id, restaurantId, displayName, phone, email?,
                     userId?      @unique  → acceso al portal (opcional)
                     employeeId?           → nómina (opcional)
                     levelMin?, levelMax?  → qué niveles puede dar
                     bio?, photoUrl?, active, sortOrder

                     // Honorarios — se CONGELAN en cada sesión al generarla
                     payType(FIXED_PER_SESSION | HOURLY | COMMISSION_PERCENT)
                     payAmountBase Decimal(12,2)?   fijo por sesión, u hora
                     commissionPercent Decimal(5,2)?

ClubCoachAvailability coachId, weekday(0-6), startTime, endTime
                     → franjas en las que acepta dar clase

ClubCoachTimeOff     coachId, startsAt, endsAt, reason?
                     → ausencias puntuales (vacaciones, lesión)
```

`ClubCoachAvailability` **no bloquea cancha**: solo restringe qué grupos y qué
clases particulares se le pueden asignar. La cancha la bloquea el
`ClubCourtBlock`, y solo cuando la clase existe de verdad. Si la disponibilidad
del profesor ocupara la rejilla, un club con cuatro profesores no podría vender
una sola hora libre.

### 2.3 Grupos y sus horarios

```
ClubClassGroup   id, restaurantId, name, coachId,
                 levelMin, levelMax,
                 classType(GROUP | PRIVATE | CLINIC)
                 capacityMin, capacityMax,
                 seasonStart, seasonEnd?,
                 priceMonthlyBase?, pricePerClassBase?, packagePriceBase?,
                 releaseHoursBefore?   → null = hereda de ClubAcademySettings
                 status(DRAFT | ACTIVE | PAUSED | ENDED)

ClubClassSlot    groupId, weekday(0-6), startTime, durationMinutes, courtId?
                 → una fila por día de la semana en que se reúne el grupo
                 → courtId null = cualquier cancha libre al generar
```

Un grupo que se reúne lunes y miércoles son **dos `ClubClassSlot`**, no un JSON
ni dos grupos. El generador de §3 itera slots; los reportes agrupan por grupo.

### 2.4 Alumnos

El alumno **es un `Customer`**, con una extensión:

```
ClubStudent   id, restaurantId,
              customerId  @unique  → la identidad (teléfono, nombre, historial)
              level Decimal(2,1)?, birthDate?,
              guardianName?, guardianPhone?,   → menores de edad
              accessToken @unique (nanoid)     → portal del alumno
              medicalNotes?, active, createdAt
```

La misma persona alquila cancha y toma clases. Una identidad separada partiría
su historial en dos y rompería el CRM, que ya se apoya en que `Customer` es
único por teléfono por tenant (`club.service.ts:300`, `getPanelCourts:605`).

### 2.5 Inscripciones y asistencias

```
ClubEnrollment  id, restaurantId, studentId, groupId,
                billingMode(MONTHLY | PACKAGE | PER_CLASS)
                priceBase Decimal(12,2)   ← congelado al inscribir
                billingDay Int?           ← día del mes que se cobra (MONTHLY)
                status(ACTIVE | PAUSED | CANCELLED | FINISHED)
                startsAt, endsAt?,
                levelOverrideReason?      ← si se saltó la regla de nivel
                @@unique([studentId, groupId, startsAt])

ClubClassSession id, restaurantId,
                blockId @unique?          ← NULL si NEEDS_COURT (§0.2)
                groupId?                  ← NULL en clase personalizada suelta
                coachId, courtId?,
                startsAt, endsAt,         ← duplicados del bloque A PROPÓSITO:
                                             la sesión sobrevive a que el bloque
                                             se cancele, y el histórico necesita
                                             saber cuándo iba a ser
                classType, capacityMin, capacityMax,   ← congelados al generar
                releaseHoursBefore,                    ← congelado al generar
                payType, payAmountBase, commissionPercent, ← honorario congelado
                coachFeeBase Decimal(12,2)?  ← calculado al cerrar
                status(SCHEDULED | NEEDS_COURT | CONFIRMED | DONE
                       | CANCELLED | RELEASED)
                cancelReason?, notifiedCoachAt?

ClubAttendance  id, sessionId, studentId,
                status(PRESENT | ABSENT | JUSTIFIED | MAKEUP)
                consumedValueBase Decimal(12,2)   ← §0.5
                creditEntryId?    ← qué ficha consumió, si consumió una
                markedByUserId?, markedAt
                @@unique([sessionId, studentId])
```

`startsAt`/`endsAt` se duplican del bloque **solo aquí**: es la excepción
consciente a la regla de no denormalizar. Una sesión liberada por falta de cupo
tiene su bloque cancelado, y el reporte de «clases que no se llenaron» necesita
la hora que iba a tener.

### 2.6 Fichas, lotes y el libro mayor

```
ClubClassPackage    id, restaurantId, studentId,
                    name, totalClasses Int,
                    priceBase Decimal(12,2),
                    pricePerClassBase Decimal(12,2)  ← priceBase/totalClasses,
                                                        congelado: es el valor
                                                        que consume cada ficha
                    purchasedAt, expiresAt?,
                    groupId?   ← si el lote es para un grupo concreto
                    paymentId? → ClubAcademyPayment

ClubClassCreditEntry id, restaurantId, studentId,
                    delta Int,                      ← +N al comprar, -1 al asistir
                    reason(PACKAGE_PURCHASE | CLASS_CONSUMED
                           | CANCELLATION_TOKEN | EXPIRED
                           | MANUAL_ADJUST | REFUND)
                    packageId?, sessionId?, note?,
                    expiresAt?, createdAt
                    @@index([restaurantId, studentId])
```

**Por qué un modelo propio y no el `ClubPass` de horas de cancha:** las unidades
no son intercambiables. Una hora de cancha se consume al reservar y vale lo que
vale esa franja; una clase se consume al *pasar lista* y vale lo que valía el
lote. Unificarlas obligaría a una columna `unit` que toda consulta tendría que
filtrar, a cambio de compartir una suma trivial. Cuando se construya `ClubPass`,
que copie esta forma; no que la comparta.

**«Clase por lote se cancela al momento de pagar»** (el requisito literal): la
compra del lote crea, en una sola transacción, `ClubClassPackage` +
`ClubAcademyPayment` (el dinero, que entra al arqueo hoy) + una entrada
`PACKAGE_PURCHASE` de `delta = +N`. A partir de ahí no se vuelve a cobrar: cada
asistencia escribe `-1`.

### 2.6.1 El lote reserva una silla recurrente, no N clases sueltas

**Decisión de negocio confirmada:** al comprar el lote, el alumno escoge un
horario fijo —«todos los lunes a las 7pm»— y lo mantiene durante varios meses.
El lote no es un bono flotante que se gasta donde caiga: es **un cupo reservado
en una franja concreta**.

Esto cambia dos cosas respecto a un bono genérico:

```
ClubClassPackage  + slotId?      → el ClubClassSlot que el alumno se reserva
                  + holdsSeat    Boolean @default(true)
                  + expiresAt?   editable por paquete (default de ajustes)
```

1. **El cupo se cuenta hacia adelante.** Una sesión que todavía no ocurrió ya
   tiene sillas ocupadas por los lotes vigentes de ese slot. Sin esto, recepción
   vendería el mismo puesto dos veces: el contador de inscritos vería el grupo
   vacío en octubre porque nadie ha «asistido» aún.

   `plazasOcupadas(sesión) = inscripciones MENSUALES activas
                           + lotes vigentes con holdsSeat sobre ese slot
                           + inscripciones sueltas a esa fecha`

   Esta única función es la que alimentan a la vez el cupo máximo, la regla de
   liberación (§3.2) y el «quedan 2 puestos» del portal público. Calcularlo en
   tres sitios distintos garantizaría que se desincronicen.

2. **La ficha sigue siendo genérica al gastarse.** El lote *reserva* el lunes
   7pm, pero si el alumno falta un lunes y recupera un miércoles, la ficha vale
   igual. Atar la ficha al slot además de la silla castigaría dos veces la misma
   ausencia: pierde su clase y encima no puede recuperarla.

El vencimiento (`expiresAt`) sale de `creditExpiryDays` al comprar, pero queda
**editable por paquete** desde el panel: un alumno lesionado dos meses no puede
perder lo que pagó porque el plazo por defecto no contemplaba eso.

### 2.7 Cobros

```
ClubAcademyPayment  id, restaurantId, studentId,
                    kind(PACKAGE | MONTHLY | SINGLE_CLASS | ENROLLMENT_FEE)
                    packageId?, chargeId?, sessionId?,
                    amountBase Decimal(12,2), exchangeRate, amountBs,
                    method PaymentMethod, referenceNumber?, proofImageUrl?,
                    receivedByUserId?, createdAt

ClubAcademyCharge   id, restaurantId, enrollmentId,
                    periodYear Int, periodMonth Int,
                    amountBase Decimal(12,2), dueDate,
                    status(PENDING | PAID | WAIVED | OVERDUE)
                    notifiedAt?
                    @@unique([enrollmentId, periodYear, periodMonth])
```

El `@@unique` del cargo es lo que hace idempotente la generación mensual: se
puede llamar diez veces el mismo día sin duplicar la deuda del alumno.

### 2.8 Reglas de reserva

```
ClubAcademySettings  restaurantId @unique,
                     defaultReleaseHoursBefore Int  @default(12)
                     cancelDeadlineHours       Int  @default(24)
                     maxMakeupPerMonth         Int  @default(2)
                     creditExpiryDays          Int? @default(90)
                     enrollmentOpensDaysBefore Int  @default(30)
                     enforceLevelOnEnroll      Boolean @default(true)
                     notifyCoachOnEnroll       Boolean @default(true)
```

Una fila por tenant con los valores por defecto; el grupo solo sobreescribe
`releaseHoursBefore` donde haga falta. Repetir las siete columnas en cada grupo
sería ruido en el 95% de los casos.

---

## 3. Lógica de pistas (requisito 2)

### 3.1 Bloqueo automático al crear un grupo recurrente

`generateSessions(groupId, horizonWeeks)`:

1. Para cada `ClubClassSlot`, expandir las fechas del `weekday` dentro de
   `[hoy, hoy + horizonWeeks]` ∩ `[seasonStart, seasonEnd]`.
2. Saltar las que ya tienen `ClubClassSession` (idempotente por
   `@@unique([groupId, startsAt, courtId])`).
3. Por cada fecha, **en su propia transacción**: crear
   `ClubCourtBlock(kind='CLASS')` + `ClubClassSession(status='SCHEDULED')`.
4. Si el INSERT choca contra `club_court_blocks_no_overlap` (detectado con
   `isOverlapError`, `club.service.ts:30` — se reutiliza tal cual):
   - si el slot tenía `courtId = null`, reintentar con la siguiente cancha libre;
   - si no queda ninguna, crear la sesión con `blockId = null` y
     `status = 'NEEDS_COURT'`.
5. Devolver `{ created, conflicts[] }` para que la UI muestre las fechas a
   resolver.

**Una transacción por ocurrencia, no una para todas.** Una transacción única
haría que un solo choque en la semana 7 tirara abajo las seis semanas buenas —
y, peor, mantendría un lock sobre la tabla del calendario durante toda la
generación, justo la tabla por la que pasa cada reserva del club.

### 3.2 Regla de liberación por cupo mínimo

`releaseUnderfilledSessions(restaurantId)` — perezosa, junto a
`settlePastBookings`:

```
Para cada sesión SCHEDULED cuyo startsAt esté dentro de releaseHoursBefore:
    confirmados = COUNT(inscripciones ACTIVE del grupo)
                + COUNT(reservas sueltas de esa sesión)
    si confirmados >= capacityMin  → status = CONFIRMED (ya no se libera)
    si confirmados <  capacityMin  → LIBERAR:
        - bloque.status = CANCELLED      ← la cancha vuelve a la parrilla al instante
        - sesión.status = RELEASED
        - +1 ficha CANCELLATION_TOKEN a cada inscrito  ← no pierde su clase
        - WhatsApp al profesor y a los alumnos
```

Cancelar el bloque libera la cancha **sin ningún trabajo extra**: la restricción
solo mira los bloques `status <> 'CANCELLED'` (`PADEL-ARQUITECTURA.md:29`), y
`getAvailability` filtra por `status: 'ACTIVE'` (`club.service.ts:210`). El
hueco reaparece en la parrilla pública en la siguiente consulta.

**Idempotencia obligatoria:** al ser perezosa, dos peticiones simultáneas pueden
entrar a la vez. La transición se hace con un `updateMany` condicionado a
`status: 'SCHEDULED'` y solo se actúa sobre las filas que realmente cambiaron
(`count > 0`) — si no, el alumno recibe dos fichas por la misma cancelación.

---

## 4. Portal del entrenador (requisito 3)

**Rol nuevo `COACH`** en `UserRole`. No se recicla `WAITER`: ese rol arrastra
acceso a Cocina y Órdenes de Mesa (`RESTRICTED_ROLES`, `src/utils/roles.ts:22`),
que en un club no significan nada.

> ⚠️ `src/utils/roles.ts` y `web/src/utils/roles.ts` son **espejos manuales**
> (lo advierte `CLAUDE.md`). Hay que tocar los dos, más `ASSIGNABLE_TEAM_ROLES`.

Pantallas (todas alcance «solo lo mío», filtrado por `coachId` derivado del
`userId` del token, nunca de un parámetro):

1. **Mi agenda** — sesiones de hoy/semana, con cancha y alumnos inscritos.
2. **Pasar lista** — la pantalla que más se usa y la que hay que hacer rápida:
   un tap por alumno (Presente / Ausente / Justificado), un botón para guardar.
   Endpoint en lote, no uno por alumno: en una cancha con señal mala, ocho
   llamadas sueltas dejan la lista a medias.
3. **Mi disponibilidad** — franjas semanales y ausencias puntuales.
4. **Mis honorarios** — sesiones dadas y acumulado del período, en solo lectura.
   El profesor ve lo que ganó; **quien registra el pago es el admin**, desde
   Nómina.

### 4.1 Cálculo de honorarios

**El administrador elige el modo por profesor** — no hay un criterio único
impuesto. Cada club paga distinto, y un mismo club suele tener al profesor
titular a sueldo y al suplente por comisión. Los cinco modos:

| `payType` | `coachFeeBase` | Cuándo se usa |
|---|---|---|
| `FIXED_PER_SESSION` | `payAmountBase` | Tarifa plana por clase dada |
| `HOURLY` | `payAmountBase × (durationMinutes / 60)` | Grupos de 60 y 90 min mezclados |
| `COMMISSION_ON_CONSUMED` | `commissionPercent × Σ consumedValueBase` de los `PRESENT` | Comisión sobre lo que de verdad entró esa clase |
| `COMMISSION_ON_ENROLLMENT` | `commissionPercent × Σ` mensualidad de sus inscritos, prorrateada al mes | Comisión sobre cartera, no sobre asistencia |
| `MIXED` | `payAmountBase + (commissionPercent × Σ consumedValueBase)` | Piso garantizado por clase más porcentaje |

`MIXED` obliga a que `payAmountBase` y `commissionPercent` **convivan** en la
misma sesión: por eso son dos columnas independientes y ninguna es excluyente
de la otra. El DTO valida qué campos son obligatorios según el `payType`.

La diferencia real entre los dos modos de comisión: `COMMISSION_ON_CONSUMED`
paga menos cuando faltan alumnos (el riesgo lo comparte el profesor);
`COMMISSION_ON_ENROLLMENT` paga igual asistan o no (el riesgo es del club). No
es un detalle contable — cambia el incentivo del profesor para perseguir
ausencias, y por eso lo decide el club, no el sistema.

Se congela el criterio en la sesión al generarla (§2.5) y se resuelve al cerrar.
Congelarlo importa: si en marzo se le sube la tarifa al profesor, las sesiones
de febrero no pueden cambiar de costo — el mismo criterio que `Order` y
`ClubBooking` aplican al precio y a la tasa.

El pago se liquida creando `ClubCoachPayout` + `Movement(EXPENSE, PAYROLL)` +
`EmployeePayment` en una transacción, reutilizando el módulo de nómina. Así el
honorario pesa en el balance y en el arqueo, en vez de ser un gasto invisible.

---

## 5. Portal del alumno y pagos (requisito 4)

Público, sin login, resuelto por `ClubStudent.accessToken` — el patrón de
`ClubBooking.accessToken` y `Table.qrToken`. Ruta:
`/r/:slug/academia/:token`.

Muestra: próxima clase, horario del grupo, **saldo de fichas**, historial de
asistencia y estado de pago. Permite: cancelar una clase dentro del plazo,
apuntarse a una recuperación, y ver los datos de pago para transferir.

### 5.1 Cancelación y fichas

```
Alumno cancela con >= cancelDeadlineHours de antelación
    → asistencia = JUSTIFIED, +1 ficha CANCELLATION_TOKEN
    → su silla queda libre para una recuperación de otro alumno

Alumno cancela tarde, o no aparece
    → asistencia = ABSENT, la clase se consume igual
    → sin ficha: es la regla que hace que el plazo signifique algo
```

`maxMakeupPerMonth` acota el abuso: un alumno que cancela ocho de ocho clases y
acumula ocho fichas está usando el bono como cuenta de ahorro.

### 5.2 Cobro recurrente

**No hay pasarela de pago, y no se va a añadir una** — todo el producto cobra
por referencia + aprobación manual (`PlanRequest` para la suscripción,
`OrderPaymentVerification` para los pedidos). La academia copia ese flujo:

1. El día `billingDay`, `generateMonthlyCharges()` crea el `ClubAcademyCharge`
   del mes (idempotente por el `@@unique`).
2. WhatsApp al alumno con el monto en $ **y en Bs** (a la tasa del día) y los
   datos de pago del club.
3. El alumno transfiere y responde con la referencia.
4. El admin aprueba desde el panel → `ClubAcademyPayment` + `charge.status = PAID`.

El monto en las dos monedas no es un detalle: es el mismo problema que ya se
corrigió en el recordatorio de mensualidad de la plataforma
(`subscription-reminder.service.ts`), donde un mensaje solo en $ obligaba al
cliente a hacer la cuenta.

### 5.3 Inscripción según nivel

Al inscribir, si `student.level` cae fuera de `[levelMin, levelMax]`:

- `enforceLevelOnEnroll = true` (por defecto) → 409 con el motivo, y el admin
  puede reintentar mandando `levelOverrideReason` (que queda guardado en la
  inscripción).
- `false` → pasa, pero se avisa en la UI.

Bloquear sin salida sería inservible: en un club real el profesor decide que un
3.5 aguanta el grupo de 4.0. Lo que no puede pasar es que esa excepción quede
sin rastro.

### 5.4 Clase particular agendada por el alumno, con pago por adelantado

**Decisión de negocio confirmada:** el alumno puede agendarse una clase
personalizada él mismo —eligiendo profesor y hora— siempre que pague por
adelantado.

El problema que esto abre: no hay pasarela de pago, así que entre «el alumno
reserva» y «el club confirma que el dinero llegó» pasan minutos u horas. Si la
cancha no se bloquea en ese hueco, dos alumnos pagan la misma pista. Si se
bloquea sin límite, cualquiera puede secuestrar el horario de las 7pm sin pagar
nada.

**La reserva se hace con un hold que expira:**

```
1. El alumno elige profesor + hora  → se valida contra ClubCoachAvailability,
                                       ClubCoachTimeOff y la parrilla de canchas
2. Se crea el ClubCourtBlock YA      → la cancha queda tomada de verdad
   + ClubClassSession(PENDING_PAYMENT, holdExpiresAt = now + privateHoldMinutes)
3. El alumno carga referencia y comprobante
4. Recepción aprueba → status = SCHEDULED, se avisa al profesor
   Recepción rechaza → bloque CANCELLED, cancha libre
5. Nadie hizo nada antes de holdExpiresAt → barrido perezoso libera el bloque
```

`privateHoldMinutes` va en `ClubAcademySettings` (por defecto 30). El barrido
vive junto a `releaseUnderfilledSessions` (§3.2) y comparte su exigencia de
idempotencia: dos peticiones simultáneas no pueden liberar dos veces ni cobrar
dos veces.

Un alumno que deja caducar holds repetidamente es un problema de club, no de
software: el panel lo muestra y recepción decide. No se construye un sistema de
reputación para un caso que quizá nunca ocurra.

---

## 6. Endpoints REST (requisito 5)

Módulo `src/modules/club-academy/` con la convención de cuatro archivos
(`.routes.ts` / `.controller.ts` / `.dto.ts` / `.service.ts`), montado en
`src/routes/index.ts`.

### Panel (tenant, `tenantGuard` + rol)

```
GET    /club/academy/dashboard              resumen: hoy, por cobrar, sin cupo
GET    /club/academy/coaches                CRUD entrenadores
POST   /club/academy/coaches
PATCH  /club/academy/coaches/:id
DELETE /club/academy/coaches/:id            (desactiva, no borra)
GET    /club/academy/coaches/:id/availability
PUT    /club/academy/coaches/:id/availability
POST   /club/academy/coaches/:id/time-off
GET    /club/academy/coaches/:id/payouts    honorarios por período
POST   /club/academy/coaches/:id/payouts    liquidar → Movement + EmployeePayment

GET    /club/academy/groups                 ?status=&coachId=&level=
POST   /club/academy/groups                 crea grupo + slots + genera sesiones
PATCH  /club/academy/groups/:id
POST   /club/academy/groups/:id/generate    extiende el horizonte a mano
GET    /club/academy/groups/:id/conflicts   fechas NEEDS_COURT
POST   /club/academy/sessions/:id/reassign  moverla de cancha/hora
DELETE /club/academy/groups/:id             (ENDED, cancela sesiones futuras)

GET    /club/academy/sessions               ?date=&coachId=&groupId=
POST   /club/academy/sessions               clase suelta / personalizada
PATCH  /club/academy/sessions/:id
POST   /club/academy/sessions/:id/cancel
POST   /club/academy/sessions/:id/attendance   ← EN LOTE
GET    /club/academy/sessions/:id/attendance

GET    /club/academy/students               ?q=&level=&groupId=
POST   /club/academy/students               (upsert de Customer por teléfono)
PATCH  /club/academy/students/:id
GET    /club/academy/students/:id           ficha: grupos, fichas, pagos, asistencia
GET    /club/academy/students/:id/credits   libro mayor
POST   /club/academy/students/:id/credits   ajuste manual (con motivo obligatorio)

POST   /club/academy/enrollments            inscribir (valida nivel y cupo)
PATCH  /club/academy/enrollments/:id        pausar/cancelar
POST   /club/academy/packages               vender lote → pago + fichas, atómico
GET    /club/academy/charges                ?status=&month=
POST   /club/academy/charges/generate       mensualidades del mes (idempotente)
POST   /club/academy/charges/:id/pay        aprobar pago
POST   /club/academy/payments               cobro suelto

GET    /club/academy/settings
PUT    /club/academy/settings

GET    /club/academy/reports/occupancy      ocupación de grupos (cupo vs inscritos)
GET    /club/academy/reports/revenue        ingreso − honorarios − hora de cancha
GET    /club/academy/reports/attendance     asistencia por alumno/grupo
```

### Portal del entrenador (`COACH`, alcance propio)

```
GET  /club/academy/me/sessions              ?from=&to=
GET  /club/academy/me/sessions/:id/roster
POST /club/academy/me/sessions/:id/attendance
GET  /club/academy/me/availability
PUT  /club/academy/me/availability
GET  /club/academy/me/earnings              ?from=&to=
```

### Público (alumno, sin JWT)

```
GET  /public/club/:slug/academy                    grupos abiertos con cupo y nivel
GET  /public/club/:slug/academy/student/:token     su ficha
POST /public/club/:slug/academy/student/:token/cancel/:sessionId
POST /public/club/:slug/academy/student/:token/makeup/:sessionId
POST /public/club/:slug/academy/interest           solicitud de inscripción
```

---

## 7. Integraciones obligatorias

### 7.1 El arqueo — el punto que no se puede omitir

`collectPayments` (`cash-session.service.ts`) hoy suma, para `SPORTS_CLUB`, tres
fuentes: `ClubBookingPayment`, `ShopSale` y `ShopSalePayment`. **Hay que añadir
`ClubAcademyPayment` como cuarta.**

Si se omite, el club cierra la caja con menos dinero del que entró y el arqueo
acusa una diferencia todos los días — exactamente el fallo que ya tuvo este
vertical cuando las ventas de tienda no llegaban al cierre.

### 7.2 Aviso al profesor por WhatsApp

`whatsappBotService.sendMessage(restaurantId, coach.phone, mensaje)`.

Dispara en: alumno inscrito en su grupo, clase particular asignada, sesión
liberada por falta de cupo, y recordatorio de sus clases del día.

**Fuera de la transacción, siempre.** Un fallo de WhatsApp no puede tumbar una
inscripción ya cobrada. Se marca `notifiedCoachAt` tras el envío; si falla, se
registra y se reintenta en el siguiente barrido perezoso.

### 7.3 Sockets

Dos eventos nuevos en `src/sockets/index.ts`, sala `kitchen:<restaurantId>`:

```
CLUB_ACADEMY_SESSION_UPDATED  'club:academy-session-updated'
CLUB_ACADEMY_ENROLLMENT_NEW   'club:academy-enrollment-new'
```

Además, liberar una sesión debe emitir el `CLUB_CALENDAR_CHANGED` que ya existe:
recepción tiene que ver la cancha liberarse sin recargar.

### 7.4 Frontend

- `web/src/pages/admin/club/academia/` — sub-pestañas dentro de `ClubLayout`,
  con el patrón de `ClubAdminPage.tsx` (píldora de pestañas con el scroll en un
  contenedor aparte, y `card` + `p-5`/`p-4`, que no trae padding propio).
- `web/src/utils/roles.ts` — espejo de `COACH`.
- `web/src/pages/public/ClubStudentPage.tsx` — portal del alumno.

---

## 8. Fases

| # | Fase | Contenido | Estado |
|---|---|---|---|
| **1** | Fundación | 15 modelos, migración, `ClubCoach`, `ClubStudent`, rol `COACH`, ajustes | ✅ construido |
| **2** | Grupos y calendario | Grupos, slots, generación de sesiones, conflictos, reasignación | ✅ construido |
| **3** | Inscripciones y asistencia | Inscribir con nivel, pasar lista en lote, honorarios | ✅ construido |
| **4** | Dinero | Lotes, fichas, mensualidades, cobros, **arqueo (§7.1)** | ✅ construido |
| **5** | Liberación y avisos | Cupo mínimo, fichas por cancelación, WhatsApp al profesor | ✅ construido |
| **6** | Portal del alumno y reportes | Token público, cancelar/recuperar, particular con hold, rentabilidad | ✅ API; falta la UI |

La Fase 2 es el corazón: es donde vive la promesa de «sin conflictos con el
alquiler libre».

**Pendiente de UI** (el backend está completo y probado): el portal público del
alumno (`/r/:slug/academia/:token`) y las pantallas del portal del entrenador.
Sus endpoints ya existen y responden — falta pintarlos.

---

## 9. Decisiones de negocio (confirmadas)

| Pregunta | Decisión | Dónde vive |
|---|---|---|
| ¿Para qué sirve la ficha de un lote? | El lote **reserva una silla recurrente** («todos los lunes 7pm por varios meses»). La ficha, al gastarse, es genérica: sirve para recuperar en otro día. | §2.6.1 |
| ¿Quién agenda la clase particular? | También el alumno, **con pago por adelantado** y un hold que expira. | §5.4 |
| ¿Vencen las fichas? | Sí, con plazo por defecto en ajustes y **editable por paquete** desde el panel. | §2.6.1 |
| ¿Cómo se calcula la comisión del profesor? | **El administrador elige** entre cinco modos por profesor. | §4.1 |

### Lo que estas decisiones hicieron más difícil

Las dos primeras no son ajustes de configuración, cambian el diseño:

- **La silla recurrente obliga a contar cupo hacia el futuro.** Un bono flotante
  no ocupa nada hasta que se usa; una silla reservada ocupa desde que se paga.
  De ahí que `plazasOcupadas()` tenga que ser una sola función compartida por el
  cupo máximo, la regla de liberación y el contador público — tres consumidores
  que, calculándolo por separado, se desincronizarían.
- **El pago por adelantado sin pasarela obliga al hold con vencimiento.** Es la
  única forma de que la cancha esté realmente tomada mientras se verifica el
  pago, sin regalar el horario a quien nunca paga.

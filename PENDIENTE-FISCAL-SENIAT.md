# PENDIENTE — Cumplimiento fiscal SENIAT (auditoría del módulo Unidigital)

**Estado: listo en código, NO desplegado. No activar `PRODUCTION` para ningún
restaurante hasta cerrar los bloqueantes de la sección 3.**

Fecha de la auditoría: 29 de julio de 2026
Rama: `claude/quicktap-saas-architecture-8jigf4`
Migración creada: `prisma/migrations/20260729173346_fiscal_compliance_audit_correlativity_retries`
(aplicada **solo en la base local**, nunca en producción)

---

## 1. Qué se corrigió

Auditoría de `src/modules/fiscal-invoicing/` contra los requisitos de la
Providencia 102 (facturación digital vía imprenta autorizada). Se encontraron 9
incumplimientos; 6 quedaron corregidos en código.

| # | Requisito | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Inalterabilidad | `onDelete: Cascade` borraba la factura al borrar el pedido; un WAITER podía hacerlo con solo un PIN | FK cambiado a `Restrict` + guard `hasLiveFiscalDocument()` en `deleteOrderHard()` que responde 409 y audita el intento |
| 2 | Pistas de auditoría | No existía **ningún** registro de eventos | Nuevo modelo `FiscalAuditLog` + capa `fiscal-invoicing.audit.ts` (solo-INSERT, nunca lanza) |
| 3 | Correlatividad | Race condition: dos cobros simultáneos tomaban **el mismo número de factura** | `reserveDocumentNumber()` con `SELECT ... FOR UPDATE` |
| 3 | Anulaciones | `orderId @unique` impedía emitir la NC; `voidDocument()` existía pero nunca se llamaba | `@@unique([orderId, documentType])` + `voidByCreditNote()` con `replacesInvoiceId` |
| 4 | Cálculos | El cargo por servicio (10%) y el delivery **desaparecían** del documento: `Subtotal + IVA ≠ Total` | Ambos viajan como líneas explícitas; base imponible recalculada |
| 4 | Cálculos | `TaxPercent: 16` hardcodeado incluso con `ivaEnabled: false` | `taxPercent = ivaEnabled ? 16 : 0` |
| 4 | Cálculos | IGTF completamente ausente en todo el repo | Campos `igtfEnabled`/`igtfRate` + cálculo sobre la porción pagada en divisa. **Arranca desactivado con tasa 0** |
| 5 | API fiscal | Un `400` se reintentaba igual que un `503` | `400` = permanente (no reintenta); `401`/`429`/`5xx` sí |
| 6 | Contingencias | `.catch(() => {})` vacío: una factura fallida **nunca** se reintentaba | `retryPendingIssues()` (backoff 1→60 min, 8 intentos, cada minuto) + `reconcileMissingInvoices()` |

### Archivos tocados

```
prisma/schema.prisma                                   (modificado)
prisma/migrations/20260729173346_fiscal_.../           (nuevo)
src/modules/fiscal-invoicing/fiscal-invoicing.audit.ts (nuevo)
src/modules/fiscal-invoicing/fiscal-invoicing.service.ts (modificado)
src/modules/fiscal-invoicing/fiscal-invoicing.dto.ts   (modificado)
src/modules/orders/order.service.ts                    (modificado — guard de borrado)
src/server.ts                                          (modificado — job de reintentos)
```

---

## 2. Verificaciones ya hechas

- `npx tsc --noEmit` (backend) y `npx tsc -b` (frontend): limpios
- Migración aplicada sin errores en la base local
- Probado contra Postgres real:
  - **Correlativo atómico:** 25 reservas concurrentes → 25 números únicos, 1..25 sin huecos
  - **Inalterabilidad:** la base rechaza borrar un pedido con factura emitida
  - **Unicidad:** rechaza una segunda FA del mismo pedido; acepta la NC que la referencia
  - **Auditoría:** FA y NC quedan enlazadas y con su rastro de actor/evento

Lo que **NO** está probado: la emisión real contra Unidigital (ver sección 3).

---

## 3. BLOQUEANTES antes de desplegar

### 3.1 El contrato del API nunca se ha verificado

Este es el bloqueante principal y es anterior a todo lo demás. Los comentarios
originales del módulo ya lo admitían: **los nombres de los campos del payload, el
shape de la respuesta y la ruta de números de control están asumidos, no
confirmados** contra la colección Postman real.

→ Pedir credenciales de la Empresa SandBox a `api@unidigital.global` y emitir en
QA, como mínimo: **una factura (FA) y una nota de crédito (NC)**. Hasta que eso
pase, no se puede afirmar cumplimiento de nada.

### 3.2 Falta la variable de entorno de cifrado

`FISCAL_INVOICING_ENCRYPTION_KEY` **no está definida ni en local ni en el VPS**
(verificado el 29/07/2026). `fiscal-invoicing.crypto.ts` lanza si falta.

Hoy está latente porque ningún restaurante tiene la facturación activada, pero
**si se activa sin esta variable, la emisión falla en el primer intento.**

Generar una sola vez y agregarla al `.env` del VPS:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Guardar esa clave en un gestor de contraseñas. Si se pierde, las credenciales
> de Unidigital ya guardadas quedan indescifrables y hay que volver a pedirlas.

### 3.3 Decisiones que le corresponden al contador, no al código

| Punto | Qué hace falta | Dónde está en el código |
|---|---|---|
| **Alícuota IGTF** | Tasa vigente y si aplica a este contribuyente | `FiscalInvoicingConfig.igtfRate` (hoy 0, desactivado) |
| **RIF de consumidor final** | El estándar exacto que acepta la imprenta | `CONSUMIDOR_FINAL` en `fiscal-invoicing.service.ts` (hoy `V-00000000`) |
| **Base imponible del cargo por servicio** | Si el 10% integra o no la base del IVA. Quedó **dentro** porque suma al total cobrado, pero es decisión contable | `mapOrderToDocument()`, variable `taxBase` |
| **Exenciones** | Si venden productos exentos, hace falta un flag por producto | `ExemptAmount` hoy fijo en 0 |
| **Payload de la NC** | `voidByCreditNote()` reserva el correlativo y encola la NC, pero **no la envía** | `fiscal-invoicing.service.ts` |

---

## 4. Pasos de despliegue (cuando se cierren los bloqueantes)

Mismo runbook de siempre (ver `DEPLOY.md`), con dos pasos extra marcados:

```bash
# 1. Push desde local
git push origin claude/quicktap-saas-architecture-8jigf4

# 2. VPS: pull
ssh quicktap-vps-root "cd /var/www/quicktap && git pull origin claude/quicktap-saas-architecture-8jigf4 && chown -R quicktap:quicktap /var/www/quicktap"

# 3. ⚠️ EXTRA: agregar FISCAL_INVOICING_ENCRYPTION_KEY al .env del VPS (ver 3.2)
#    ANTES de aplicar la migración.

# 4. ⚠️ EXTRA: aplicar la migración
ssh quicktap-vps-root "cd /var/www/quicktap && sudo -u quicktap npx prisma migrate deploy"

# 5. Build backend + reload
ssh quicktap-vps-root "cd /var/www/quicktap && sudo -u quicktap npm run build"
ssh quicktap-vps-root "pm2 reload quicktap-api"

# 6. Build frontend + permisos
ssh quicktap-vps-root "cd /var/www/quicktap/web && sudo -u quicktap npm run build && chown -R quicktap:quicktap /var/www/quicktap"

# 7. Humo
curl -s -o /dev/null -w "%{http_code}\n" https://quicktap.club/api/v1/ping
```

### Nota sobre la migración

`DROP INDEX "fiscal_invoices_orderId_key"` y luego
`CREATE UNIQUE INDEX ... ("orderId", "documentType")`. Falla si hubiera filas
duplicadas de (pedido, tipo).

**Verificado en producción el 29/07/2026:**

```json
{ "fiscal_invoices": 0, "configs": 0, "enabled": 0 }
```

Cero facturas, cero configuraciones, cero restaurantes con la facturación
activada. **La migración es inofensiva** — no hay datos fiscales que migrar y
nadie está emitiendo hoy. Volver a correr esta comprobación si pasa mucho tiempo
antes de desplegar:

```bash
ssh quicktap-vps-root "cd /var/www/quicktap && sudo -u quicktap node -e \"
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{console.log(JSON.stringify({
  fiscal_invoices: await p.fiscalInvoice.count(),
  configs: await p.fiscalInvoicingConfig.count(),
  enabled: await p.fiscalInvoicingConfig.count({where:{enabled:true}}),
}))})().finally(()=>p.\\\$disconnect());\""
```

---

## 5. Rollback

La migración es aditiva salvo el cambio de índice. Para revertir:

```sql
-- Volver al índice anterior
DROP INDEX "fiscal_invoices_orderId_documentType_key";
CREATE UNIQUE INDEX "fiscal_invoices_orderId_key" ON "fiscal_invoices"("orderId");
-- El FK vuelve a Cascade solo si de verdad se quiere (NO recomendado: es el
-- incumplimiento de inalterabilidad que esta auditoría corrigió).
```

Las columnas nuevas (`attempts`, `nextRetryAt`, `voidedAt`, `voidReason`,
`replacesInvoiceId`, `igtfEnabled`, `igtfRate`) y la tabla `fiscal_audit_logs`
pueden quedarse sin efecto: nada las lee si la facturación está desactivada.

---

## 6. Recomendación de activación

1. Cerrar 3.1 y 3.2
2. Desplegar
3. Activar en **QA** para **un solo** restaurante piloto
4. Emitir una FA y una NC reales; revisar `fiscal_audit_logs` y el PDF que
   devuelve la imprenta
5. Ajustar el payload con lo aprendido
6. Solo entonces pasar ese piloto a `PRODUCTION`
7. Y solo después, abrir al resto

No activar `PRODUCTION` masivamente de una vez: un payload equivocado emite
documentos fiscales inválidos que después hay que corregir uno por uno con notas
de crédito.

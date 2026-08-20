# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

QuickTap.club — a multi-tenant SaaS for restaurants: digital QR menu, real-time table orders (WebSockets → thermal ticket printer), and WhatsApp-based delivery checkout. Backend is `/` (Node/Express/TypeScript/PostgreSQL via Prisma), frontend is `/web` (Vite/React). Primary language throughout the codebase (code comments, model docs, UI copy) is Spanish.

## Commands

### Backend (repo root)

```bash
npm run dev              # ts-node-dev, http://localhost:4000
npm run build             # prisma generate && tsc -p tsconfig.json
npm run start              # node dist/server.js (after build)
npm run lint                # eslint "src/**/*.ts"
npm run typecheck          # tsc --noEmit
npm run prisma:generate   # regenerate Prisma client after schema changes
npm run prisma:migrate    # create/apply a migration in dev
npm run prisma:studio      # Prisma Studio GUI
npm run prisma:seed         # prisma/seed.ts (demo data)
npm run seed:demo           # prisma/seed-demo.ts (isDemo restaurant, excluded from platform financial reports)
npm run seed:platform-admin # create/reset the master-dashboard admin account (idempotent)
```

There is no automated test suite in this repo (no `test` script exists) — don't assume Jest/Vitest are configured.

### Frontend (`web/`)

```bash
cd web
npm run dev      # Vite dev server, http://localhost:3000, proxies /api and /socket.io to :4000
npm run build     # tsc -b && vite build
npm run lint       # oxlint
npm run preview
```

### Native shells and relay

```bash
cd web && npm run android:apk   # signed release APK (needs the keystore, see ANDROID.md)
cd web && npm run ios:open      # sync + open Xcode (needs Xcode, see IOS.md)
cd relay && npm run dev          # local offline relay, standalone (see relay/README.md)
```

## Architecture

### Multi-tenancy (shared database, shared schema)

Every domain table hangs off `restaurantId`. Isolation is enforced in three layers, not just one — don't rely on any single one:

1. `authGuard` (`src/middlewares/auth.middleware.ts`) decodes the JWT and sets `req.restaurantId` **from the token only**, never from body/params/query.
2. Every service method filters its Prisma queries by `restaurantId` explicitly (and validates that related records — e.g. a product's category — actually belong to that same tenant).
3. Composite indexes `@@index([restaurantId, ...])` throughout `prisma/schema.prisma` keep per-tenant queries fast.

Public-facing routes (menu, checkout) never take a `restaurantId` from the client — they resolve the tenant from a `Restaurant.slug` (menu/delivery link) or a `Table.qrToken` (dine-in QR), both opaque to the caller.

There are **two separate JWT realms**, both signed with the same `JWT_SECRET` but structurally distinct and not interchangeable:
- Tenant/staff auth: `AuthPayload { userId, restaurantId, role }`, verified by `authGuard`. `tenantGuard = [authGuard, blockIfLocked]` is the standard chain for panel routes — it also rejects requests if the restaurant's subscription is locked (see below). `blockIfLocked` is deliberately never mounted on `/auth/*` so login and `/auth/me` keep working even when a tenant is locked out.
- Platform/master auth: `PlatformAuthPayload { platformAdminId, scope: 'platform' }`, verified by `platformAuthGuard` (`src/middlewares/platform-auth.middleware.ts`). This is the QuickTap team's own login for the master dashboard, unrelated to any single restaurant. The `scope: 'platform'` field exists specifically so a token from one realm can't be replayed against the other.

Additional per-route guards layered on top of `tenantGuard` (all in `auth.middleware.ts`): `requireRole(...roles)`, `requireFeature(flag)` (plan-gated features), `requirePremiumPlan`, `requireInventoryAccess`.

### Module structure

Each `src/modules/<name>/` follows the same four-file convention: `*.controller.ts`, `*.service.ts`, `*.dto.ts` (Zod schemas), `*.routes.ts`. Routes mount `tenantGuard` (or `platformAuthGuard` for master routes, or nothing for public routes) at the top of the router, then layer `requireRole(...)` per mutating endpoint. `src/routes/index.ts` is the single place that wires every module's router under `/api/v1`, split into three families: tenant panel routes (JWT-protected), `/api/v1/public/*` (no auth — resolved by slug/qrToken), and `/api/v1/master/*` (platform-team-only).

Modules present: `accounting`, `ai-photo`, `auth`, `bank-accounts`, `branches`, `cash-sessions`, `categories`, `club`, `club-academy`, `club-link`, `club-players`, `club-tablet`, `club-tournament`, `cost-structure`, `customers`, `delivery-couriers`, `delivery-zones`, `exchange-rate`, `fiscal-invoicing`, `inventory`, `kitchens`, `master`, `master-whatsapp`, `menu`, `modifier-categories`, `movements`, `offline`, `orders`, `payment-orders`, `payroll`, `plan-requests`, `platform-announcements`, `platform-auth`, `platform-settings`, `products`, `promo-codes`, `promotions`, `push-tokens`, `qr-nfc-requests`, `quotes`, `ramblay`, `reports`, `reservations`, `restaurant`, `seo`, `shop`, `suppliers`, `table-sessions`, `tables`, `team`, `waitlist`, `waste`, `whatsapp-bot`, `zones`.

`cost-structure` (Administración → Estructura de costo, `accounting`-gated) is the per-product cost-structure calculator: `CostStructureConfig` (one per restaurant — fixed/variable elements as % of sale price + target net margin) and `ProductCostStructure` (frozen snapshot per product: material lines + computed result). The arithmetic lives in `src/utils/cost-structure.ts` and is mirrored 1:1 in `web/src/utils/cost-structure.ts` so the UI computes live and the server recomputes on save — **change both together**. `suggested-fixed-percent` = recurring expenses ÷ sales of the period; `stats` = coverage, average composition of saved fichas, real period structure (MP at live cost, variables by %, fixed = real recurring expenses), and ranking/alerts vs. the target margin.

### Real-time layer (Socket.IO)

Single gateway in `src/sockets/index.ts`. Two room families, joined differently depending on who's connecting:
- `kitchen:<restaurantId>` — staff clients authenticate the socket handshake with the tenant JWT (`auth.token`); receives `order:new` / `order:updated` to drive the kitchen queue and ticket printing.
- `table:<tableId>` — the public client that scanned a table's QR authenticates with just the table's `qrToken` (`auth.qrToken`, no JWT); receives `order:ready` and `table:service-ack` (waiter-call / bill-request acknowledgements). This room is the one all diners at the same physical table share.

### Print station (`print-station/index.html`)

A standalone, single-file HTML app (no build step, no dependencies besides CDN Poppins + `socket.io-client`) that acts as a physical print terminal: it logs in against `POST /api/v1/auth/login`, opens a Socket.IO connection to `kitchen:<restaurantId>` with the returned JWT, and listens for `order:new`/`order:updated` to render and print comandas (kitchen ticket / receipt, 58mm or 80mm) on whatever printers are installed on that computer via the browser's print dialog. Optional experimental direct-to-thermal-printer mode via the Web Serial API (Chrome/Edge only, bypasses the OS print dialog). Has a self-contained "modo demo" that doesn't need any backend, and a "Comanda de prueba" button that fabricates a fake order through the same render/print pipeline for testing without a live connection.

Not served through Vite or the Express app — it's meant to be opened directly (or via a tiny static server) on the till/print computer, independent of the admin panel. Because it's a separate origin, it needs its own entry in `CORS_ORIGINS` (currently `http://localhost:5500`, for local testing via `npx serve print-station -p 5500`) — a `file://` origin will NOT work, `fetch`/Socket.IO get silently blocked by CORS. Restarting `npm run dev` is required after editing `CORS_ORIGINS`, since it's only read at boot.

### WhatsApp chatbots — currently OFF (`src/config/features.ts`)

`CHATBOTS_ENABLED = false` kills all four WhatsApp bots at once: the platform's own collections bot (`master-whatsapp`), the per-restaurant order bot (`whatsapp-bot`), the club debt bot, and the panel's help widget. The flag is mirrored manually in `web/src/config/features.ts` — **change both together**.

Why it's off (2026-08-20): the platform account connects fine and `sock.sendMessage()` resolves, but WhatsApp never acknowledges the messages, so nothing is ever delivered. Diagnosis pointed to WhatsApp restricting the account for automated sending, which is the expected outcome of using Baileys (an unofficial library). The plan is to migrate to the official WhatsApp Business Cloud API — see `IOS.md`-style notes in the git history and the commits around `e3e4c9a`.

Nothing was deleted: modules, screens, stored sessions and tables are intact, so flipping the flag back is a two-line change. **Do not confuse the bots with the `wa.me` links** — opening the staff member's own WhatsApp to message a customer, a courier, or to run the delivery checkout is core product and stays on. `web/src/utils/sendWhatsapp.ts` used to try the bot and fall back to `wa.me`; with the flag off it goes straight to the link.

Collections still work manually: the master dashboard's billing block has a **"Copiar mensaje"** button (`subscriptionReminderService.previewMessage`) that builds the exact same reminder — amounts, pending charges, payment details — and copies it to the clipboard to paste by hand. It deliberately opens the payment verification (an incoming proof is matched by looking up an `AWAITING_PROOF` row for that phone) but deliberately does **not** mark `subscriptionReminderForPeriodEnd`, since copying is not sending.

### Offline mode (`relay/`)

A separate package that runs on the restaurant's own Windows PC so the dining room keeps working when the internet drops: embedded Postgres + Express/Socket.IO speaking the **same dialect as the cloud** (same routes, same socket events, same payloads), so clients only change origin. `web/src/utils/connectivity.ts` holds a three-state machine (`online` / `relay` / `offline`) that probes `/api/v1/ping` — never `navigator.onLine`, which reports true when WiFi is up but the ISP is down — with hysteresis so a one-second blip doesn't flap the whole system.

Key design points, all deliberate:
- Order numbering can't use the cloud's `pg_advisory_xact_lock` + MAX()+1 across two live databases, so offline orders get a visible `R-N` prefix printed on the comanda; the cloud assigns the canonical number at sync and keeps `Order.offlineTicketRef` for paper traceability.
- Inventory doesn't port the recipe engine to the relay (divergence risk). The cloud resolves consumption **once** at snapshot time and ships a flat table the relay just multiplies.
- Anything that can't be merged back lands in `SyncConflict` and shows up in a review screen. There is deliberately **no "apply anyway" button** — blindly reinserting could double-charge a closed tab.
- The relay caches bcrypt hashes for WAITER/CASHIER/KITCHEN only (never owners/admins) so staff can log in during a long outage.

**Not yet in production use:** the relay only runs standalone (`npm run dev` inside `relay/`); it is not wired into the Electron main process, and the embedded-Postgres spike was only validated on macOS — repeat it on a real Windows PC before shipping to a restaurant.

### Native apps

Same shell pattern for all three: they open the live site, so **every web deploy reaches installed apps without reinstalling anything**.
- **Android** (`web/android`, Capacitor) — see `ANDROID.md`. Signed release APK; keystore lives in `~/QuickTap-keys/`, outside the repo. Cleartext HTTP is permitted only for RFC1918 private ranges, so tablets can reach the relay.
- **iOS** (`web/ios`, Capacitor + Swift Package Manager, no CocoaPods) — see `IOS.md`. Project is configured but **not published**: iOS has no APK equivalent, and any distribution needs the Apple Developer Program.
- **Windows** (`web/electron`) — packages the panel itself and self-updates.

`web/src/utils/native-platform.ts#isInstalledApp()` makes the installed apps open straight at `/admin/login` instead of the landing. Android is detected via Capacitor's platform; **Electron is not** — the Capacitor Electron plugin doesn't declare a platform in the renderer, so `getPlatform()` returns `web` there. Desktop is detected through `window.electronBridge` (our own preload).

Push notifications (FCM) go through `src/utils/push.ts` and `DeviceToken` — see `FIREBASE-PUSH.md`. `pushLowStockCrossings()` keeps an in-memory set of already-notified items so a low item doesn't push on every sale.

### Data model (`prisma/schema.prisma`)

- `Restaurant` is the tenant root: `slug`, `baseCurrency` (USD/EUR — prices are entered in this currency), `theme` (JSON, public menu colors), `paymentMethodsConfig` (JSON, which checkout payment methods the restaurant accepts from its own customers), plus subscription state (see below).
- Catalog: `Category` → `Product` (priced in `baseCurrency`; marketing flags `isStar`/`isPromo`/`isHouseSpecial`; optional `Kitchen` station for ticket routing; cost is either `MANUAL` (`costBase` entered by hand) or `RECIPE` (live-summed from `RecipeIngredient`, Premium/Pro only)).
- Floor plan: `Zone` → `Table` (`qrToken` unique/opaque, embedded in the printed QR; `seats` is visual only). **Merged tables**: `Table.mergedIntoTableId` is a one-level self-relation — the member table points at the primary, only the primary holds the `TableSession`, and `preMergePlanX/Y` back up the original position so unmerging restores it. Resolution lives in `src/utils/table-merge.ts` and is injected at ~8 lookup sites rather than changing `Order.tableId`, which stays unambiguous. **The easy thing to miss**: `src/sockets/index.ts` must select `mergedIntoTableId` and join the primary's room, or a diner who scanned a member table's QR never receives `order:ready`.
- Front-of-house scheduling: `Reservation` (accept / seat / no-show, sourced from the public menu or created by staff — waiters only see accepted ones) and `WaitlistEntry`.
- `TableSession` is the "open tab": from a table's first order until staff closes it, every `DINE_IN` order accumulates into the same session (optional 4-digit PIN set after the first order to stop strangers from ordering onto someone else's tab).
- `Order`: `channel` (`DINE_IN`/`DELIVERY`/`PICKUP`/`BAR`), `status` (`NEEDS_CONFIRMATION` → `PENDING`/`KITCHEN` → `SERVED`/`CANCELLED`). All money fields are a **frozen snapshot taken at order time** (`subtotalBase`, `serviceChargeBase`, `ivaBase`, `totalBase`, `exchangeRate`, `totalBs`, `tipBase`, `deliveryFeeBase`) — they never get recomputed retroactively if prices or the exchange rate change later. `OrderItem` similarly snapshots `productName`/`unitPrice`/`kitchenName` at order time, independent of later edits to the `Product`.
- **An unpaid order can never disappear from Pedidos.** Two things enforce it. `listLiveOrders` has no age cutoff: it pulls everything not cancelled, returns non-`SERVED` orders as-is, and keeps `SERVED` ones only while they still owe — the balance is computed in JS because it can't be done in SQL (payments carry discounts that forgive part of the debt). And a database trigger, `trg_no_ocultar_cuentas_impagas` (migration `20260820000000_no_ocultar_cuentas_impagas`), nulls out any attempt to stamp `clearedAt` on an order that still owes more than a cent. The trigger lives in the DB and not in app code on purpose: the incident that motivated it was a bulk `UPDATE` run straight against Postgres on 2026-08-14 that hid 142 orders — 137 of them real unpaid money at one restaurant — and no TypeScript guard would have stopped it. It nulls the attempt instead of raising, so one bad order can't abort a whole cash close. The trade-off, accepted deliberately: a restaurant that never registers payments (some don't) sees this list grow without bound.
- `Order.offlineTicketRef` keeps the `R-N` number a comanda was printed with when it was taken offline (see Offline mode).
- Currency/exchange rate: `ExchangeRate` is **global, not per-tenant** — one row per currency (USD/EUR), refreshed periodically (`EXCHANGE_RATE_TTL_HOURS`, default 6h) from an external BCV-mirroring source, with fail-safe fallback to the last cached rate if the source is unreachable. Public menu prices are always shown to the diner in Bs, converted at the current rate; each `Order` freezes the rate it used.
- Platform billing (how a *restaurant* pays QuickTap — not to be confused with `PaymentMethod`, which is how a *diner* pays the restaurant): `SubscriptionPlan`/`BillingCycle`/`PlanRequest`. There's no payment gateway integration — a restaurant submits a payment reference number and the QuickTap team approves it manually from the master dashboard. `src/utils/subscription.ts` computes lock status live from `periodEnd + GRACE_HOURS` (12h grace, `TRIAL_DAYS = 15`) — it is **never persisted as a boolean**, so extending `periodEnd` always unlocks the account automatically without a separate flag to desync. `suspended` is the one manual override, persisted separately. `hasFeature()` gates `administration`/`inventoryBasic`/`inventoryRecipe`/`accountsPayable`/`accounting`/`crm`: PRO (restaurant) gets only `administration` + `inventoryBasic` (Administración = Resumen/Estadísticas/Productos/Delivery/Métodos de pago, plus Gastos); ELITE/PREMIUM/legacy SUCURSALES get everything; SHOP (locales) gets everything except `accounting` (órdenes de pago, contabilidad, bancos, proveedores, libros, margen) unless `Restaurant.legacyFullAccessUntil` is still in the future (Shop accounts paid before Elite Shop existed — cleared on the next activation); ELITE_SHOP and CLUB get everything; CUSTOM checks the individual `custom*` boolean columns. Branches (`allowsBranches`) are DELIVERY/ELITE/ELITE_SHOP + legacy SUCURSALES plans.
- Ops/back-office extras: `Movement` (manual cash ledger entries + the Expenses module, with `ExpenseCategory`, optional `Supplier`, optional auto-restock of an `InventoryItem`), `CashSession` (till open/close, with a frozen `closingSummary` snapshot so historical receipts don't drift), `InventoryItem` + `RecipeIngredient` (Premium/Pro-gated recipe costing that auto-decrements stock on `SERVED`), `DeliveryCourier` + `DeliveryZone` (polygon-based zone pricing, drawn on a map), `Customer` (auto-upserted by phone whenever a table/delivery/pickup order captures one), `PromoCode`, `PlatformSettings`/`PlatformAdmin` (QuickTap's own team/config, not tenant data), `DeviceToken` (FCM push targets), `SyncConflict` (offline orders that couldn't be merged back).

### Roles and permissions

`src/utils/roles.ts` is the single source of truth for backend role checks; `web/src/utils/roles.ts` keeps a manual mirror for the frontend nav/UI — **update both when changing role logic**, they are not derived from a shared file. Role groups: `FULL_ACCESS_ROLES` (OWNER/ADMIN/CASHIER/STAFF — STAFF is deprecated, no longer assignable from the UI but still supported), `ADMIN_CASHIER_ROLES` (catalog/tables/admin-config mutations), `RESTRICTED_ROLES` (WAITER/KITCHEN — limited to Kitchen + Table Orders, no catalog/config mutations), `SCREEN` (read-only, public-facing TV display: rotating carousel of the public menu — 4 products per page, name + price only, auto-hides out-of-stock/unavailable items since it re-fetches `/public/menu/:slug`, which already filters those server-side).

### Frontend (`web/`)

Vite + React 19 + TypeScript + Tailwind v4 + React Router v7 + `socket.io-client`. `App.tsx` lazy-loads three independent route trees so a menu visitor never downloads the admin panel bundle (and vice versa):
- Public: `/` (landing), `/r/:slug` (menu — presence of `?mesa=<qrToken>` switches it into dine-in/table mode with direct-to-kitchen checkout; its absence means delivery/pickup mode, which builds a WhatsApp checkout link instead). `/:slug` is a legacy redirect to `/r/:slug` for links printed before that prefix existed.
- Restaurant panel: `/admin/*` under `AdminLayout` (kitchen, delivery, products, tables, table-orders, reservations, settings, billing, administration, inventory, expenses, screen, pedidos-por-revisar), gated by `AuthContext`. In the installed apps `/` redirects here — see Native apps.
- Master/platform dashboard: `/master/*` under `MasterLayout`, gated by `MasterAuthContext` — the QuickTap team's own console (all restaurants, payment-proof review, promo codes, platform settings), unrelated to any single tenant's data.

Other contexts: `MoneyVisibilityContext` (toggle to hide monetary amounts on shared/public screens, e.g. the Screen view).

`web/src/api/client.ts` resolves its `baseURL` per request from `apiOrigin()`, so the whole panel can switch between the cloud and the local relay at runtime. **Known gap**: only `TableOrdersPage` reconnects its socket when the origin changes; other panels keep the old origin until reloaded.

### Deploy

Single VPS, no CI/CD (see `DEPLOY.md` for the full runbook). PM2 (`ecosystem.config.js`, single fork instance, nightly restart at 3am `America/Caracas` to cap memory) runs the compiled Express API; Nginx serves `web/dist` as static files and reverse-proxies `/api/`, `/uploads/`, and `/socket.io/` to the PM2 process. Uploaded files (product photos, logos, payment proofs) live on disk under `uploads/`, which is gitignored — back it up separately. Updating production is a manual `git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 reload quicktap-api` (plus the equivalent rebuild in `web/`).

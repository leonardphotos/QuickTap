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

Modules present: `auth`, `cash-sessions`, `categories`, `customers`, `delivery-couriers`, `delivery-zones`, `exchange-rate`, `inventory`, `kitchens`, `master`, `menu`, `movements`, `orders`, `plan-requests`, `platform-auth`, `platform-settings`, `products`, `promo-codes`, `qr-nfc-requests`, `restaurant`, `suppliers`, `table-sessions`, `tables`, `team`, `zones`.

### Real-time layer (Socket.IO)

Single gateway in `src/sockets/index.ts`. Two room families, joined differently depending on who's connecting:
- `kitchen:<restaurantId>` — staff clients authenticate the socket handshake with the tenant JWT (`auth.token`); receives `order:new` / `order:updated` to drive the kitchen queue and ticket printing.
- `table:<tableId>` — the public client that scanned a table's QR authenticates with just the table's `qrToken` (`auth.qrToken`, no JWT); receives `order:ready` and `table:service-ack` (waiter-call / bill-request acknowledgements). This room is the one all diners at the same physical table share.

### Print station (`print-station/index.html`)

A standalone, single-file HTML app (no build step, no dependencies besides CDN Poppins + `socket.io-client`) that acts as a physical print terminal: it logs in against `POST /api/v1/auth/login`, opens a Socket.IO connection to `kitchen:<restaurantId>` with the returned JWT, and listens for `order:new`/`order:updated` to render and print comandas (kitchen ticket / receipt, 58mm or 80mm) on whatever printers are installed on that computer via the browser's print dialog. Optional experimental direct-to-thermal-printer mode via the Web Serial API (Chrome/Edge only, bypasses the OS print dialog). Has a self-contained "modo demo" that doesn't need any backend, and a "Comanda de prueba" button that fabricates a fake order through the same render/print pipeline for testing without a live connection.

Not served through Vite or the Express app — it's meant to be opened directly (or via a tiny static server) on the till/print computer, independent of the admin panel. Because it's a separate origin, it needs its own entry in `CORS_ORIGINS` (currently `http://localhost:5500`, for local testing via `npx serve print-station -p 5500`) — a `file://` origin will NOT work, `fetch`/Socket.IO get silently blocked by CORS. Restarting `npm run dev` is required after editing `CORS_ORIGINS`, since it's only read at boot.

**Status as of last session:** hooked up to a local dev backend + `seed:demo` data (`demo@quicktap.club` / `Demo1234`), but the live connection test was hitting a generic "Failed to fetch" in the browser — not yet root-caused. Prime suspects, in order: (1) backend wasn't restarted after the `CORS_ORIGINS` edit, (2) the page was opened via `file://` instead of the served `localhost:5500` origin, (3) `npx serve` picked a different port than 5500, (4) the backend never actually came up (e.g. Postgres not running). Check the browser console for the specific underlying error (CORS policy vs. `ERR_CONNECTION_REFUSED`) before guessing further.

### Data model (`prisma/schema.prisma`)

- `Restaurant` is the tenant root: `slug`, `baseCurrency` (USD/EUR — prices are entered in this currency), `theme` (JSON, public menu colors), `paymentMethodsConfig` (JSON, which checkout payment methods the restaurant accepts from its own customers), plus subscription state (see below).
- Catalog: `Category` → `Product` (priced in `baseCurrency`; marketing flags `isStar`/`isPromo`/`isHouseSpecial`; optional `Kitchen` station for ticket routing; cost is either `MANUAL` (`costBase` entered by hand) or `RECIPE` (live-summed from `RecipeIngredient`, Premium/Pro only)).
- Floor plan: `Zone` → `Table` (`qrToken` unique/opaque, embedded in the printed QR).
- `TableSession` is the "open tab": from a table's first order until staff closes it, every `DINE_IN` order accumulates into the same session (optional 4-digit PIN set after the first order to stop strangers from ordering onto someone else's tab).
- `Order`: `channel` (`DINE_IN`/`DELIVERY`/`PICKUP`/`BAR`), `status` (`NEEDS_CONFIRMATION` → `PENDING`/`KITCHEN` → `SERVED`/`CANCELLED`). All money fields are a **frozen snapshot taken at order time** (`subtotalBase`, `serviceChargeBase`, `ivaBase`, `totalBase`, `exchangeRate`, `totalBs`, `tipBase`, `deliveryFeeBase`) — they never get recomputed retroactively if prices or the exchange rate change later. `OrderItem` similarly snapshots `productName`/`unitPrice`/`kitchenName` at order time, independent of later edits to the `Product`.
- Currency/exchange rate: `ExchangeRate` is **global, not per-tenant** — one row per currency (USD/EUR), refreshed periodically (`EXCHANGE_RATE_TTL_HOURS`, default 6h) from an external BCV-mirroring source, with fail-safe fallback to the last cached rate if the source is unreachable. Public menu prices are always shown to the diner in Bs, converted at the current rate; each `Order` freezes the rate it used.
- Platform billing (how a *restaurant* pays QuickTap — not to be confused with `PaymentMethod`, which is how a *diner* pays the restaurant): `SubscriptionPlan`/`BillingCycle`/`PlanRequest`. There's no payment gateway integration — a restaurant submits a payment reference number and the QuickTap team approves it manually from the master dashboard. `src/utils/subscription.ts` computes lock status live from `periodEnd + GRACE_HOURS` (12h grace, `TRIAL_DAYS = 15`) — it is **never persisted as a boolean**, so extending `periodEnd` always unlocks the account automatically without a separate flag to desync. `suspended` is the one manual override, persisted separately. `hasFeature()` gates `administration`/`inventoryBasic`/`inventoryRecipe`/`accountsPayable`: PRO and PREMIUM get all of them, CUSTOM checks the individual `custom*` boolean columns on `Restaurant`.
- Ops/back-office extras: `Movement` (manual cash ledger entries + the Expenses module, with `ExpenseCategory`, optional `Supplier`, optional auto-restock of an `InventoryItem`), `CashSession` (till open/close, with a frozen `closingSummary` snapshot so historical receipts don't drift), `InventoryItem` + `RecipeIngredient` (Premium/Pro-gated recipe costing that auto-decrements stock on `SERVED`), `DeliveryCourier` + `DeliveryZone` (polygon-based zone pricing, drawn on a map), `Customer` (auto-upserted by phone whenever a table/delivery/pickup order captures one), `PromoCode`, `PlatformSettings`/`PlatformAdmin` (QuickTap's own team/config, not tenant data).

### Roles and permissions

`src/utils/roles.ts` is the single source of truth for backend role checks; `web/src/utils/roles.ts` keeps a manual mirror for the frontend nav/UI — **update both when changing role logic**, they are not derived from a shared file. Role groups: `FULL_ACCESS_ROLES` (OWNER/ADMIN/CASHIER/STAFF — STAFF is deprecated, no longer assignable from the UI but still supported), `ADMIN_CASHIER_ROLES` (catalog/tables/admin-config mutations), `RESTRICTED_ROLES` (WAITER/KITCHEN — limited to Kitchen + Table Orders, no catalog/config mutations), `SCREEN` (read-only horizontal TV view of tables + kitchen).

### Frontend (`web/`)

Vite + React 19 + TypeScript + Tailwind v4 + React Router v7 + `socket.io-client`. `App.tsx` lazy-loads three independent route trees so a menu visitor never downloads the admin panel bundle (and vice versa):
- Public: `/` (landing), `/r/:slug` (menu — presence of `?mesa=<qrToken>` switches it into dine-in/table mode with direct-to-kitchen checkout; its absence means delivery/pickup mode, which builds a WhatsApp checkout link instead). `/:slug` is a legacy redirect to `/r/:slug` for links printed before that prefix existed.
- Restaurant panel: `/admin/*` under `AdminLayout` (kitchen, delivery, products, tables, table-orders, settings, billing, administration, inventory, expenses, screen), gated by `AuthContext`.
- Master/platform dashboard: `/master/*` under `MasterLayout`, gated by `MasterAuthContext` — the QuickTap team's own console (all restaurants, payment-proof review, promo codes, platform settings), unrelated to any single tenant's data.

Other contexts: `MoneyVisibilityContext` (toggle to hide monetary amounts on shared/public screens, e.g. the Screen view).

### Deploy

Single VPS, no CI/CD (see `DEPLOY.md` for the full runbook). PM2 (`ecosystem.config.js`, single fork instance, nightly restart at 3am `America/Caracas` to cap memory) runs the compiled Express API; Nginx serves `web/dist` as static files and reverse-proxies `/api/`, `/uploads/`, and `/socket.io/` to the PM2 process. Uploaded files (product photos, logos, payment proofs) live on disk under `uploads/`, which is gitignored — back it up separately. Updating production is a manual `git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 reload quicktap-api` (plus the equivalent rebuild in `web/`).

# Relé local (modo sin conexión)

Mantiene el salón operando cuando se cae el internet del local: tomar pedidos de mesa,
mandarlos a cocina e imprimir la comanda, todo por la red WiFi del restaurante, sin nube.

Corre dentro de la app de escritorio (la PC que el restaurante ya tiene). No necesita hardware
nuevo.

## Cómo funciona

Habla **el mismo dialecto que la nube**: mismas rutas (`POST /api/v1/orders/manual`), mismo
evento de socket (`order:new`), mismo formato de datos. Por eso las tablets y la Estación de
Impresión solo tienen que apuntar a otra dirección — su lógica no cambia.

Los precios se calculan con un port 1:1 del motor de producción (`src/pricing.ts` ↔
`src/modules/orders/order.service.ts`). **Si cambia el cálculo en producción, hay que cambiarlo
acá también**: un pedido tomado sin conexión tiene que costar lo mismo que uno con conexión, o
la cuenta no cuadra al reconectar.

## Numeración de pedidos

La nube numera con un candado de Postgres (`pg_advisory_xact_lock` + MAX+1). Eso no sirve acá:
la nube y el relé son dos bases separadas y ambas darían los mismos números.

Mientras no hay internet, el relé usa su propio contador y estampa una referencia visible en la
comanda: **`R-1`, `R-2`…** Así el mesero sabe de un vistazo que ese pedido nació offline. El
número definitivo lo asigna la nube al sincronizar (Fase 4), guardando el `R-N` para poder
rastrear "la comanda R-3 es ahora el pedido #48".

## Probarlo suelto (sin Electron)

```bash
cd relay
npm install
npm run prisma:generate
RELAY_JWT_SECRET="<el mismo JWT_SECRET de la nube>" npm run dev
```

Levanta Postgres embebido y el servidor en `http://0.0.0.0:4001`.

```bash
curl http://127.0.0.1:4001/api/v1/relay/health
```

El token tiene que ser uno emitido por la nube (o generado con el mismo secreto): el relé lo
verifica criptográficamente, sin consultar ninguna base — por eso funciona con internet caído.

## Inventario

El stock **sí baja al servir**, para que el salón vea qué se está acabando durante el corte.

Descontar de verdad encadena recetas, preparaciones anidadas y envases — un motor grande que ya
vive en `order.service.ts`. En vez de portarlo (y arriesgar que calcule distinto), la nube lo
resuelve UNA vez al armar el snapshot: para cada producto y variante calcula cuánto insumo
consume una unidad, y manda esa tabla ya resuelta. El relé solo multiplica.

Es una **proyección a propósito**: la nube sigue siendo la autoridad y descuenta de verdad al
sincronizar los pedidos; el siguiente snapshot pisa el stock local con el real. Así, si el relé
se desvía, el error se corrige solo en vez de acumularse.

## Entrar durante un corte largo

Si el corte dura más que la sesión de un mesero, su token vence y quedaría fuera justo cuando
más se necesita. El relé guarda una copia del **hash** de las contraseñas del personal de salón
(nunca la contraseña; solo puede comparar, no leer) y puede emitir un token nuevo, válido 12
horas — lo justo para cubrir un turno.

Solo se cachean los roles que atienden el salón (mesero, cajero, cocina). Un dueño o
administrador no tiene nada que hacer en el panel durante un corte, y su credencial es la más
sensible. Al sincronizar, la lista se reemplaza entera: alguien dado de baja en la nube deja de
poder entrar acá.

## Qué NO hace (a propósito)

Fuera del alcance offline acordado: delivery (imposible sin internet), ajustes/mermas/traslados
de inventario a mano, reportes, caja, cambios de configuración, push y WhatsApp.

## Estado

- **Fase 0** ✅ Postgres embebido validado (ver `docs/offline-mode-spike.md`)
- **Fase 1** ✅ Servidor local: toma pedidos y emite a cocina, verificado end-to-end
- **Fase 2** ✅ Catálogo e inventario bajan de la nube; el stock baja al servir
- **Fase 3** ✅ Las tablets y la impresora cambian solas al relé y vuelven al reconectar
- **Fase 4** ✅ Lo del corte sube solo, renumerado y sin duplicados
- **Fase 5** ✅ Los pedidos que no encajan quedan para revisión humana
- **Fase 6** ✅ Android habla por red local; se puede entrar aunque venza la sesión

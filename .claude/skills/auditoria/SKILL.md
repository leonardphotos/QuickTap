---
name: auditoria
description: Auditoría profunda del vertical de restaurantes. Simula pedidos por QR en mesa, delivery, pickup, panel, pagos, descuentos, inventario, caja, cocina, combos, mesas unidas y devoluciones contra un restaurante de pruebas aislado, buscando fallos reales. Úsala cuando Leonardo pida "auditoría", "revisa restaurantes", "busca fallos" o "simula pedidos".
---

# Auditoría del vertical restaurante

Simulador de flujos punta a punta contra un restaurante de pruebas aislado
(`auditoria-qt`), pensado para **encontrar fallos**, no para confirmar que todo va bien.

## Cómo correrla

```bash
./auditoria/correr.sh
```

Reinicia la API (el limitador de peticiones vive en memoria y bloquea corridas
seguidas), crea el restaurante de pruebas desde cero y ejecuta todas las baterías.
Imprime `✓` por comprobación, `✗` por fallo y `·` por observación, y al final el
recuento.

## Antes de empezar

- La API local debe poder arrancar (`npm run dev`).
- El script **borra y recrea** el restaurante `auditoria-qt` en cada corrida. No toca
  ningún otro restaurante.
- Al terminar, **borrar el restaurante de pruebas**:
  `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.restaurant.delete({where:{slug:'auditoria-qt'}}).finally(()=>p.$disconnect())"`

## Qué cubre

`auditoria/escenarios*.js`, una batería por archivo:

| Archivo | Áreas |
|---|---|
| escenarios.js | QR en mesa, cobro, delivery, pedido manual, aislamiento entre restaurantes, estados |
| escenarios2.js | Pago fraccionado, descuentos y permisos, inventario por receta, concurrencia de numeración, caja |
| escenarios3.js | Variantes, modificadores, propinas, PIN de mesa, reportes vs. base, trigger de impagas |
| escenarios4.js | Control de stock, envases, combos, tasa congelada, no disponibles, borrado y bitácora |
| escenarios5.js | Mesas unidas, cocina con varias estaciones, aceptación de pedidos |
| escenarios6.js | Carreras de cobro, cancelar con plata encima, deuda, devoluciones |
| escenarios7.js | Bloqueo por falta de stock, encendido y apagado |

## Cómo interpretar el resultado

**Un `✗` no siempre es un fallo del producto.** Muchas veces es el propio test usando
un nombre de campo o un payload equivocado. Antes de tocar código de producción:

1. Leer el mensaje de error real que devuelve la API.
2. Buscar el DTO o el modelo para confirmar los nombres.
3. Solo entonces decidir si el fallo es del producto o del test.

Anoche, de 11 `✗` iniciales, 8 eran del test y 3 eran fallos reales.

**Las notas (`·`) son donde suelen esconderse los hallazgos.** Marcan comportamientos
que no son claramente correctos ni incorrectos y piden criterio — de ahí salieron los
tres fallos reales de la primera corrida.

## Al ampliarla

Agregar escenarios nuevos al archivo que corresponda, o crear `escenarios8.js` y
registrarlo en `sim.js`. Cada comprobación usa `check(condición, título, detalle)`;
el detalle debe traer los valores reales, porque es lo único que se ve al fallar.

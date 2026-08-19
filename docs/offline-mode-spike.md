# Spike: Postgres embebido para el relé local (modo offline)

Resultado de la Fase 0 del plan de modo offline (ver `~/.claude/plans/harmonic-hatching-yeti.md`
en la sesión donde se diseñó). Decide si construir el relé local sobre `embedded-postgres` es
viable antes de comprometerse con el resto de la arquitectura.

## Qué se probó

`embedded-postgres` (npm), el mismo paquete recomendado en el plan, en un directorio aislado
fuera del repo:

1. Arrancar una instancia embebida desde cero (equivalente a abrir la app de escritorio por
   primera vez en una PC sin Postgres preinstalado).
2. Migrar con **el mismo Prisma 5.22 que usa el backend real** (`prisma db push` contra un
   schema con `@db.Decimal`, el tipo que usan todos los campos de dinero).
3. Insertar y leer con **Prisma Client real**, no SQL crudo — confirma que la capa ORM completa
   funciona, no solo la conexión.
4. Detener el proceso y volver a arrancar apuntando al mismo directorio de datos (equivalente a
   cerrar la app y reabrirla al día siguiente) — confirmar que los datos sobreviven.

## Resultado: **GO**

| Paso | Resultado |
|---|---|
| Primer arranque (con `initdb`) | 776ms |
| `prisma db push` con tipos `@db.Decimal` | OK, sin cambios al schema |
| Insert/query vía Prisma Client (cuid real) | OK — `cmt0ks29s0000mjukskmncvs3` |
| Segundo arranque (datos ya existentes) | 40ms |
| Datos tras el reinicio | Sobrevivieron intactos |

Sin fricción alguna con el schema real del proyecto. El paquete lleva un binario dedicado para
`windows-x64` (`@embedded-postgres/windows-x64`, ~104MB sin comprimir) — activo desde 2022, 1.6M
descargas/mes; el prefijo "beta" en su versionado es solo convención, no indica inestabilidad.

## Lo que este spike NO prueba

Se corrió en macOS (arm64), no en Windows — no hay una máquina Windows disponible en este
entorno. Lo que valida es el **patrón de integración** (arrancar/detener el proceso embebido,
migrar y operar con el mismo Prisma Client y los mismos tipos de dato que usa producción) y el
comportamiento genérico del paquete, no el binario de Windows en sí. **Antes de enviarlo a un
restaurante real, hay que repetir exactamente esta misma prueba en una PC Windows limpia**
(instalador de la app de escritorio, sin Postgres preinstalado) para confirmar que el binario
`windows-x64` arranca igual de limpio ahí. Riesgo residual bajo (mismo paquete, target oficial),
pero no cerrado del todo sin esa prueba.

## Decisión

Seguir con `embedded-postgres` como base del relé local (Fase 1 del plan), sin necesidad del
plan B (instalador de Postgres standalone aparte).

# Respaldos de QuickTap

## Qué se respalda y dónde

`quicktap-backup.sh` corre en el VPS todos los días a las 04:00 UTC (00:00 Caracas), vía
`/etc/cron.d/quicktap-backup`, y deja en `/var/backups/quicktap/` (solo root):

| Archivo                  | Contenido                                                     |
|--------------------------|---------------------------------------------------------------|
| `db-<fecha>.dump`        | `pg_dump -Fc` de la base `quicktap` (comprimido, formato custom) |
| `uploads-<fecha>.tgz`    | `uploads/` (fotos, logos, comprobantes) sin la `_papelera`     |
| `env-<fecha>`            | el `.env` (JWT_SECRET, claves de cifrado, API keys)            |
| `.last-ok`               | epoch del último respaldo exitoso (para monitoreo)            |

Se conservan **14 días**. Log en `/var/log/quicktap-backup.log`.

**El `.env` es parte del respaldo a propósito**: `FISCAL_INVOICING_ENCRYPTION_KEY` y
`OLACLICK_ENCRYPTION_KEY` cifran datos que están en la base; un dump sin esas claves tiene
esas columnas ilegibles, y sin el `JWT_SECRET` original todos los usuarios pierden sesión.

## Instalar en un VPS nuevo

```bash
cp deploy/backup/quicktap-backup.sh /usr/local/bin/ && chmod 700 /usr/local/bin/quicktap-backup.sh
cat > /etc/cron.d/quicktap-backup <<'EOF2'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 4 * * * root /usr/local/bin/quicktap-backup.sh >> /var/log/quicktap-backup.log 2>&1
EOF2
/usr/local/bin/quicktap-backup.sh   # primera corrida a mano, para ver que todo esté bien
```

## Restaurar (probado el 2026-08-18)

Base de datos — sobre una base vacía (`CREATE DATABASE quicktap OWNER quicktap`):

```bash
# el dump está en un directorio solo-root; postgres no puede leerlo ahí -> copiar a /tmp
cp /var/backups/quicktap/db-<fecha>.dump /tmp/restore.dump && chown postgres:postgres /tmp/restore.dump
sudo -u postgres pg_restore --no-owner --role=quicktap -d quicktap /tmp/restore.dump
rm /tmp/restore.dump
```

(Un único error `role "quicktap_user" does not exist` en el GRANT final es inofensivo: es el
nombre del rol en el VPS original; el dueño real de las tablas queda `quicktap`.)

Uploads: `tar xzf /var/backups/quicktap/uploads-<fecha>.tgz -C /var/www/quicktap && chown -R quicktap:quicktap /var/www/quicktap/uploads`

`.env`: `cp /var/backups/quicktap/env-<fecha> /var/www/quicktap/.env` y ajustar solo `DATABASE_URL`.

Después: `npx prisma migrate deploy` (por si el código es más nuevo que el dump) y `pm2 reload quicktap-api`.

## Copia fuera del VPS

La caída del 2026-08-17 demostró que un respaldo que vive solo dentro del VPS no sirve si el
VPS se pierde. La copia off-site se documenta debajo cuando quede configurada.

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

## Copia fuera del VPS (off-site)

`quicktap-backup.sh` termina llamando a `quicktap-backup-offsite.sh`, que sube los 3 archivos
del respaldo del día (db/uploads/env) a un bucket Backblaze B2 con `rclone` — así la copia
sobrevive aunque el VPS entero desaparezca (que fue justo la causa de la caída del 2026-08-17:
los respaldos vivían solo dentro del servidor que se perdió).

- Bucket: `quicktap-respaldos` (privado), carpeta `daily/`.
- Retención en el bucket: **30 días** (se borra lo más viejo en cada corrida).
- Si el remoto `b2` de rclone no está configurado, el paso off-site se omite en silencio (no
  rompe el respaldo local) y queda un aviso en el log.
- Probado el 2026-08-18: se descargó un dump *directo del bucket* (no del disco del VPS) y se
  restauró en una base temporal — 19 restaurantes, miles de pedidos, 140 migraciones, íntegro.

### Configurar el remoto en un VPS nuevo

```bash
curl -fsSL https://rclone.org/install.sh | bash
rclone config create b2 b2 account <keyID> key '<applicationKey>' hard_delete true
chmod 600 /root/.config/rclone/rclone.conf
```

Las credenciales (Key ID + Application Key) están en Backblaze → *Account* → *App Keys* →
`vps-quicktap`, con acceso limitado solo al bucket `quicktap-respaldos`. Si se pierden, se
revoca esa key desde el panel de Backblaze y se genera una nueva — no dependen del VPS viejo.

### Restaurar desde el bucket (sin disco local, ej. VPS nuevo desde cero)

```bash
rclone lsl b2:quicktap-respaldos/daily          # ver qué hay y de qué fecha
rclone copy b2:quicktap-respaldos/daily/db-<fecha>.dump /tmp/
chown postgres:postgres /tmp/db-<fecha>.dump
sudo -u postgres pg_restore --no-owner --role=quicktap -d quicktap /tmp/db-<fecha>.dump
rclone copy b2:quicktap-respaldos/daily/uploads-<fecha>.tgz /tmp/
tar xzf /tmp/uploads-<fecha>.tgz -C /var/www/quicktap && chown -R quicktap:quicktap /var/www/quicktap/uploads
rclone copy b2:quicktap-respaldos/daily/env-<fecha> /var/www/quicktap/.env
```

### Monitoreo

`/var/backups/quicktap/.last-offsite-ok` guarda el epoch de la última subida exitosa (además
de `.last-ok` para el respaldo local). Si algún día se agrega un chequeo de salud del servidor,
avisar si `.last-offsite-ok` tiene más de ~26h es la señal de que algo se rompió.

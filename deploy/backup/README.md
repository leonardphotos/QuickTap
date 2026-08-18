# Respaldos de QuickTap

## Qué se respalda, cuándo y dónde

Un cron corre `quicktap-backup.sh` **cada 4 horas** (`0 */4 * * *`, hora del VPS = UTC), vía
`/etc/cron.d/quicktap-backup`:

| Qué                    | Frecuencia                         | Por qué                                                        |
|-------------------------|-------------------------------------|------------------------------------------------------------------|
| Base de datos (`pg_dump -Fc`) | **cada 4 horas** (6x/día)     | Es chica (~1-2 MB) y `pg_dump` no bloquea escrituras — hacerlo seguido no le pesa al servidor, y limita a 4h lo que se puede perder si algo se rompe. |
| `uploads/` (fotos, comprobantes) | **1 vez al día** (corrida de las 04:00 UTC) | Pesa 80+ MB y casi no cambia entre una corrida y la siguiente — comprimirlo 6 veces al día sería trabajo desperdiciado sin beneficio real. |
| `.env` (secretos)       | 1 vez al día, junto con uploads     | Sin esto un dump de la base no sirve: `FISCAL_INVOICING_ENCRYPTION_KEY`/`OLACLICK_ENCRYPTION_KEY` cifran datos que están en la base, y sin el `JWT_SECRET` original todos los usuarios pierden sesión. |

Todo queda en `/var/backups/quicktap/` (solo root), con **14 días** de historial local
(~14 días × 6 dumps × 1.2 MB + 14 × 16 MB de uploads ≈ 320 MB — nada frente a los 30+ GB libres
del disco). Rotación automática por antigüedad en cada corrida. Log en
`/var/log/quicktap-backup.log`. `.last-ok` guarda el epoch del último respaldo exitoso.

## Instalar en un VPS nuevo

```bash
cp deploy/backup/quicktap-backup.sh deploy/backup/quicktap-backup-offsite.sh /usr/local/bin/
chmod 700 /usr/local/bin/quicktap-backup*.sh
cat > /etc/cron.d/quicktap-backup <<'EOF2'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 */4 * * * root /usr/local/bin/quicktap-backup.sh >> /var/log/quicktap-backup.log 2>&1
EOF2
chmod 644 /etc/cron.d/quicktap-backup
/usr/local/bin/quicktap-backup.sh   # primera corrida a mano, para ver que todo esté bien
```

(La configuración del remoto `b2` de rclone para la copia off-site está más abajo.)

## Restaurar desde el disco local del VPS

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

**Ojo:** como `uploads/`/`.env` solo se generan en la corrida de las 04:00 UTC, para restaurarlos
usa el archivo `uploads-<fecha>`/`env-<fecha>` más reciente disponible — no necesariamente el de
la misma hora que el `db-<fecha>` que elegiste.

## Copia fuera del VPS (off-site)

`quicktap-backup.sh` termina llamando a `quicktap-backup-offsite.sh`, pasándole solo los archivos
que generó ESA corrida (el dump siempre; uploads/.env solo en la de las 04:00) — sube eso a un
bucket Backblaze B2 con `rclone`, así la copia
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

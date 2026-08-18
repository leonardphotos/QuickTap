#!/usr/bin/env bash
# Respaldo de QuickTap. Corre cada 4 horas (cron: 0 */4 * * *):
#   - Base de datos: SIEMPRE (pg_dump es liviano — un dump de ~1-2 MB, no golpea el servidor
#     ni bloquea escrituras — así que hacerlo 6 veces al día no tiene costo real).
#   - uploads/ + .env: SOLO en la corrida de las 04:00 UTC. Volver a comprimir 80+ MB de fotos
#     y comprobantes 6 veces al día sería trabajo desperdiciado — esos archivos casi no cambian
#     entre una corrida y la siguiente, así que alcanza con una vez al día.
# Guarda en /var/backups/quicktap (14 días de historial) y sube cada archivo nuevo a Backblaze
# B2 (ver quicktap-backup-offsite.sh) — así la copia sobrevive aunque el VPS desaparezca.
set -euo pipefail

BACKUP_DIR=/var/backups/quicktap
KEEP_DAYS=14
APP_DIR=/var/www/quicktap
STAMP=$(date +%Y%m%d-%H%M%S)
LOG=/var/log/quicktap-backup.log
UPLOADED=()

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

log "inicio respaldo $STAMP"

# 1) Base de datos — cada corrida. -Fc = formato custom (comprimido, restaurable con pg_restore).
DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
sudo -u postgres pg_dump -Fc -d quicktap -f /tmp/qt-db-$STAMP.dump
mv /tmp/qt-db-$STAMP.dump "$DB_FILE"
chmod 600 "$DB_FILE"

# Verificación mínima: que pg_restore pueda leer el índice del dump (detecta archivos truncados).
pg_restore -l "$DB_FILE" > /dev/null
log "db ok: $(du -h "$DB_FILE" | cut -f1) $DB_FILE"
UPLOADED+=("$DB_FILE")

# 2) Uploads + .env — solo en la corrida de las 04:00 UTC (una vez al día).
if [ "$(date +%H)" = "04" ]; then
  UP_FILE="$BACKUP_DIR/uploads-$STAMP.tgz"
  tar czf "$UP_FILE" -C "$APP_DIR" --exclude='uploads/_papelera' uploads
  chmod 600 "$UP_FILE"
  log "uploads ok: $(du -h "$UP_FILE" | cut -f1) $UP_FILE"
  UPLOADED+=("$UP_FILE")

  ENV_FILE="$BACKUP_DIR/env-$STAMP"
  cp "$APP_DIR/.env" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  UPLOADED+=("$ENV_FILE")
else
  log "uploads/.env: se omiten (solo corren en la pasada de las 04:00 UTC)"
fi

# 3) Rotación local.
find "$BACKUP_DIR" -type f -mtime +$KEEP_DAYS -delete
log "rotación: quedan $(ls "$BACKUP_DIR" | wc -l) archivos, $(du -sh "$BACKUP_DIR" | cut -f1)"

# 4) Copia fuera del VPS: solo lo que se generó en ESTA corrida (evita re-subir todo cada vez).
/usr/local/bin/quicktap-backup-offsite.sh "${UPLOADED[@]}" || log "AVISO: falló la copia off-site (el respaldo local sí quedó)"

date +%s > "$BACKUP_DIR/.last-ok"
log "fin respaldo $STAMP"

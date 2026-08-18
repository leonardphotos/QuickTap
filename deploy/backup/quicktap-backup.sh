#!/usr/bin/env bash
# Respaldo diario de QuickTap: base de datos (pg_dump formato custom, comprimido) + uploads/.
# Corre por cron a las 4:00 (hora del servidor, UTC) — después del reinicio nocturno de PM2
# (3:00 America/Caracas). Guarda 14 días en /var/backups/quicktap. Este directorio es la copia
# LOCAL; la copia fuera del VPS la hace el paso off-site (ver deploy/backup/README).
set -euo pipefail

BACKUP_DIR=/var/backups/quicktap
KEEP_DAYS=14
APP_DIR=/var/www/quicktap
STAMP=$(date +%Y%m%d-%H%M%S)
LOG=/var/log/quicktap-backup.log

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

log "inicio respaldo $STAMP"

# 1) Base de datos. -Fc = formato custom (ya comprimido, restaurable con pg_restore).
DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
sudo -u postgres pg_dump -Fc -d quicktap -f /tmp/qt-db-$STAMP.dump
mv /tmp/qt-db-$STAMP.dump "$DB_FILE"
chmod 600 "$DB_FILE"

# Verificación mínima: que pg_restore pueda leer el índice del dump (detecta archivos truncados).
pg_restore -l "$DB_FILE" > /dev/null   # pg_restore -l solo lee el índice, no necesita conexión
log "db ok: $(du -h "$DB_FILE" | cut -f1) $DB_FILE"

# 2) Archivos subidos (fotos, logos, comprobantes). Excluye la papelera.
UP_FILE="$BACKUP_DIR/uploads-$STAMP.tgz"
tar czf "$UP_FILE" -C "$APP_DIR" --exclude='uploads/_papelera' uploads
chmod 600 "$UP_FILE"
log "uploads ok: $(du -h "$UP_FILE" | cut -f1) $UP_FILE"

# 3) .env (secretos: JWT, claves de cifrado fiscal/OlaClick, Resend…). Sin esto un dump de la
#    base no sirve: los datos cifrados quedarían ilegibles. Solo lectura por root.
cp "$APP_DIR/.env" "$BACKUP_DIR/env-$STAMP"
chmod 600 "$BACKUP_DIR/env-$STAMP"

# 4) Rotación.
find "$BACKUP_DIR" -type f -mtime +$KEEP_DAYS -delete
log "rotación: quedan $(ls "$BACKUP_DIR" | wc -l) archivos, $(du -sh "$BACKUP_DIR" | cut -f1)"

# Copia fuera del VPS (no falla el respaldo local si el bucket no responde: queda en el log).
/usr/local/bin/quicktap-backup-offsite.sh || log "AVISO: falló la copia off-site (el respaldo local sí quedó)"

# Marca "último respaldo OK" para monitoreo.
date +%s > "$BACKUP_DIR/.last-ok"
log "fin respaldo $STAMP"

#!/usr/bin/env bash
# Sube el respaldo local más reciente (db + uploads + env) al bucket off-site con rclone.
# Lo llama quicktap-backup.sh al final. El remoto "b2" se configura una sola vez con
# `rclone config` (credenciales en /root/.config/rclone/rclone.conf, solo root).
# Retención en el bucket: 30 días (rclone delete --min-age).
set -euo pipefail
BACKUP_DIR=/var/backups/quicktap
REMOTE="b2:${QT_BACKUP_BUCKET:-quicktap-respaldos}/daily"
LOG=/var/log/quicktap-backup.log
log() { echo "[$(date '+%F %T')] offsite: $*" | tee -a "$LOG"; }

if ! rclone listremotes 2>/dev/null | grep -q '^b2:'; then
  log "remoto b2 no configurado todavía — omitido"; exit 0
fi

# Últimos 3 archivos = el set completo de la corrida de hoy (db, uploads, env).
for f in $(ls -t "$BACKUP_DIR"/db-* "$BACKUP_DIR"/uploads-* "$BACKUP_DIR"/env-* 2>/dev/null | head -3); do
  rclone copyto "$f" "$REMOTE/$(basename "$f")" --retries 3 --low-level-retries 10 -q
  log "subido $(basename "$f")"
done

rclone delete "$REMOTE" --min-age 30d -q || true
COUNT=$(rclone ls "$REMOTE" | wc -l)
log "bucket ok: $COUNT archivos en $REMOTE"
date +%s > "$BACKUP_DIR/.last-offsite-ok"

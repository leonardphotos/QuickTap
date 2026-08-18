#!/usr/bin/env bash
# Sube a Backblaze B2 los archivos que le pasen como argumento (llamado por quicktap-backup.sh
# con solo lo que generó esa corrida — no vuelve a listar el directorio completo).
# Remoto "b2" configurado una sola vez con `rclone config` (ver deploy/backup/README.md).
set -euo pipefail
BACKUP_DIR=/var/backups/quicktap
REMOTE="b2:${QT_BACKUP_BUCKET:-quicktap-respaldos}/daily"
LOG=/var/log/quicktap-backup.log
log() { echo "[$(date '+%F %T')] offsite: $*" | tee -a "$LOG"; }

if ! rclone listremotes 2>/dev/null | grep -q '^b2:'; then
  log "remoto b2 no configurado todavía — omitido"; exit 0
fi

if [ "$#" -eq 0 ]; then
  log "sin archivos que subir"; exit 0
fi

for f in "$@"; do
  rclone copyto "$f" "$REMOTE/$(basename "$f")" --retries 3 --low-level-retries 10 -q
  log "subido $(basename "$f")"
done

rclone delete "$REMOTE" --min-age 30d -q || true
COUNT=$(rclone ls "$REMOTE" | wc -l)
log "bucket ok: $COUNT archivos en $REMOTE"
date +%s > "$BACKUP_DIR/.last-offsite-ok"

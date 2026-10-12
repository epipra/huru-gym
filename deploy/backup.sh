#!/bin/sh
# Huru GYM backups: the api's data volume (accounts, passkeys, workouts, billing, consent, the
# session secret, Coach config), tarred and encrypted with rclone crypt, to Cloudflare R2.
#
# Runs in the `backup` service (docker-compose.yml). One backup per UTC day, taken the first
# hour the machine is up that day, so a PC that sleeps at night still gets one; backups older
# than BACKUP_KEEP_DAYS are deleted after each new one succeeds, never otherwise.
#
#   backup.sh daemon            the service: check every hour, back up once a day
#   backup.sh now               one backup now
#   backup.sh list              what is stored (decrypted names, sizes, times)
#   backup.sh get <file> [dir]  download and decrypt one backup to dir (default /restore)
#
# Env: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, BACKUP_PASSPHRASE
# (without it nothing can be restored: keep a copy outside this machine), BACKUP_KEEP_DAYS (30).
set -eu

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: $*"; }

if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_ENDPOINT:-}" ] || [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  log "off: set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and BACKUP_PASSPHRASE in deploy/.env"
  [ "${1:-daemon}" = daemon ] && exec sleep 2147483647
  exit 1
fi

# rclone remotes from the environment, so no config file holds the keys (and none is looked for).
export RCLONE_LOG_LEVEL="${RCLONE_LOG_LEVEL:-ERROR}"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_REGION=auto
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_VAULT_TYPE=crypt RCLONE_CONFIG_VAULT_REMOTE="r2:${R2_BUCKET:-huru-gym-backups}/huru-data"
RCLONE_CONFIG_VAULT_PASSWORD="$(rclone obscure "$BACKUP_PASSPHRASE")"
export RCLONE_CONFIG_VAULT_PASSWORD
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

name_for_today() { echo "huru-data-$(date -u +%Y-%m-%d).tgz"; }

backup_now() {
  name="$(name_for_today)"
  tmp="/tmp/$name"
  # The api writes every file to a temporary name and renames it, so each file read here is whole.
  # Each step checks itself: `set -e` does not apply inside a function called from an `if`.
  tar czf "$tmp" -C /data . || { rm -f "$tmp"; log "tar failed"; return 1; }
  size="$(du -k "$tmp" | cut -f1)"
  rclone copyto "$tmp" "vault:$name" || { rm -f "$tmp"; log "upload failed"; return 1; }
  rm -f "$tmp"
  # Only after a good upload: never let retention empty the bucket while backups are failing.
  rclone delete vault: --min-age "${KEEP_DAYS}d" || log "old backups not pruned (will retry tomorrow)"
  log "ok: $name, ${size} KiB encrypted to R2; keeping $KEEP_DAYS days"
}

case "${1:-daemon}" in
  now) backup_now ;;
  list) rclone lsl vault: ;;
  get)
    [ -n "${2:-}" ] || { echo "usage: backup.sh get <file> [dir]"; exit 2; }
    rclone copyto "vault:$2" "${3:-/restore}/$2"
    log "restored $2 to ${3:-/restore}"
    ;;
  daemon)
    done_day=""
    if rclone lsf vault: --include "$(name_for_today)" 2>/dev/null | grep -q .; then done_day="$(date -u +%Y-%m-%d)"; fi
    log "on: one backup a day to ${R2_BUCKET:-huru-gym-backups}, keeping $KEEP_DAYS days"
    while :; do
      today="$(date -u +%Y-%m-%d)"
      if [ "$done_day" != "$today" ]; then
        if backup_now; then done_day="$today"; else log "FAILED, trying again in an hour"; fi
      fi
      sleep 3600
    done
    ;;
  *) echo "usage: backup.sh daemon|now|list|get <file> [dir]"; exit 2 ;;
esac

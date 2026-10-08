#!/usr/bin/env bash
# One-time set-up of the daily backup (M10.3), after ops/provision.sh. Safe to re-run.
# Usage: sudo ops/backup/install.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

echo "== Packages: age, rclone"
apt-get install -y age rclone

echo "== Scripts in /opt/tracklite/backup"
install -d -m 755 /opt/tracklite/backup
install -m 755 "$here/backup.sh" "$here/notify-failure.sh" "$here/restore.sh" /opt/tracklite/backup/

echo "== /etc/tracklite/backup.env"
if [ ! -f /etc/tracklite/backup.env ]; then
  install -m 600 "$here/backup.env.example" /etc/tracklite/backup.env
  echo "Wrote /etc/tracklite/backup.env. Fill in every value before the first backup."
fi

echo "== systemd timer"
install -m 644 "$here/tracklite-backup.service" "$here/tracklite-backup.timer" \
  "$here/tracklite-backup-failed.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tracklite-backup.timer
systemctl list-timers tracklite-backup.timer --no-pager

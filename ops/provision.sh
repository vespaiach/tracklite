#!/usr/bin/env bash
# One-time set-up of a fresh Debian 13 VPS (M10.1). Safe to re-run.
# Usage: sudo ops/provision.sh tracklite.example.com
set -euo pipefail

domain="${1:?Usage: sudo ops/provision.sh <domain>}"
here="$(cd "$(dirname "$0")" && pwd)"

echo "== Packages: PostgreSQL 18 (PGDG), Caddy, Node 24"
apt-get update
apt-get install -y curl gnupg openssl debian-keyring debian-archive-keyring apt-transport-https postgresql-common
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y postgresql-18 caddy nodejs

echo "== Logs kept 14 days"
install -D -m 644 "$here/journald/tracklite.conf" /etc/systemd/journald.conf.d/tracklite.conf
install -m 644 "$here/logrotate/postgresql-common" /etc/logrotate.d/postgresql-common
systemctl restart systemd-journald

echo "== App user and release directory"
id tracklite >/dev/null 2>&1 \
  || useradd --system --home-dir /opt/tracklite --shell /usr/sbin/nologin tracklite
install -d -o tracklite -g tracklite /opt/tracklite /opt/tracklite/releases

echo "== Database and /etc/tracklite/env"
if [ ! -f /etc/tracklite/env ]; then
  password="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
create role tracklite login password '$password';
create database tracklite owner tracklite;
SQL
  install -d -m 700 /etc/tracklite
  sed -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://tracklite:$password@localhost:5432/tracklite|" \
      -e "s|^APP_URL=.*|APP_URL=https://$domain|" \
      "$here/env.example" > /etc/tracklite/env
  chmod 600 /etc/tracklite/env
  echo "Wrote /etc/tracklite/env. Fill in EMAIL_FROM, RESEND_API_KEY and RESEND_WEBHOOK_SECRET."
fi

echo "== Caddy for $domain"
install -m 644 "$here/Caddyfile" /etc/caddy/Caddyfile
install -d -m 750 -o root -g caddy /etc/caddy/certs
install -d /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=TRACKLITE_DOMAIN=%s\n' "$domain" > /etc/systemd/system/caddy.service.d/tracklite.conf

echo "== systemd units"
install -m 644 "$here/systemd/tracklite-web.service" "$here/systemd/tracklite-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable postgresql caddy tracklite-web tracklite-worker
if [ -f /etc/caddy/certs/origin.pem ] && [ -f /etc/caddy/certs/origin.key ]; then
  systemctl restart caddy
else
  echo "No Cloudflare origin certificate yet. Put it in /etc/caddy/certs/origin.pem and origin.key, then: systemctl restart caddy"
fi
if [ -e /opt/tracklite/current ]; then
  systemctl restart tracklite-web tracklite-worker
else
  echo "No release in /opt/tracklite/current yet; web and worker start after the first deploy."
fi

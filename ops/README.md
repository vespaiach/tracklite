# Server set-up (M10.1)

One Debian 13 VPS runs Caddy, `tracklite-web`, `tracklite-worker` and PostgreSQL 18, all under systemd (design §1.1).

| File in `ops/` | Installed as | What it does |
|---|---|---|
| `Caddyfile` | `/etc/caddy/Caddyfile` | TLS, HTTP→HTTPS redirect, HSTS and the §4.9 headers, `X-Forwarded-For`, access log without `token` |
| `systemd/tracklite-web.service` | `/etc/systemd/system/` | `next start` on `127.0.0.1:3000`, from `/opt/tracklite/current` |
| `systemd/tracklite-worker.service` | `/etc/systemd/system/` | `scripts/worker.ts`, from `/opt/tracklite/current` |
| `journald/tracklite.conf` | `/etc/systemd/journald.conf.d/` | journald keeps 14 days (OPS-006) |
| `logrotate/postgresql-common` | `/etc/logrotate.d/` | PostgreSQL's own log files keep 14 days (OPS-006) |
| `env.example` | `/etc/tracklite/env` (mode 600) | secrets and settings (§1.6); real values never go in the repository |

`/opt/tracklite/current` points at the live release. Creating releases and switching that link is the deploy command's job (M10.2).

## First set-up

1. Point the domain's `A`/`AAAA` records at the VPS and open ports 80 and 443.
2. Copy this repository's `ops/` folder to the VPS and run:

   ```bash
   sudo ops/provision.sh tracklite.example.com
   ```

3. Fill in `EMAIL_FROM`, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` in `/etc/tracklite/env`:

   ```bash
   sudo editor /etc/tracklite/env
   ```

4. Check the Caddy config:

   ```bash
   sudo TRACKLITE_DOMAIN=tracklite.example.com caddy validate --config /etc/caddy/Caddyfile
   ```

5. Deploy a release (M10.2), then create the first admin with `npm run setup` (OPS-001).

## Checks by hand

Replace `tracklite.example.com` with the real domain.

- **The app serves over HTTPS.** `curl -sI https://tracklite.example.com/health` answers `200` with `strict-transport-security: max-age=31536000`, `x-content-type-options: nosniff` and `referrer-policy: same-origin`.
- **SEC-005.1.** `curl -sI http://tracklite.example.com/my-issues` answers a `308` redirect with `location: https://tracklite.example.com/my-issues`.
- **SEC-007.2.** Open `https://tracklite.example.com/reset-password?token=abc`, then run `sudo journalctl -u caddy -n 5`. The logged `uri` is `/reset-password` with no `token`.
- **Logs.** `systemctl status tracklite-web tracklite-worker` shows both as active. `journalctl -u tracklite-web` shows the app's log lines.

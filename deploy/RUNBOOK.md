# Huru GYM - Server runbook

Beta host: `gym.adxfuel.com` on one Ubuntu 24.04 VPS, Docker Compose, Caddy for HTTPS.

## 1. One-time server setup (as root)
```sh
apt-get update && apt-get -y upgrade
apt-get -y install ca-certificates curl git ufw unattended-upgrades restic
curl -fsSL https://get.docker.com | sh
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config && systemctl reload ssh
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /srv/huru-gym/data && chmod 700 /srv/huru-gym/data   # api container runs as root (upstream image)
```

## 2. DNS
At the DNS host for `adxfuel.com`: `A gym -> <VPS IPv4>` (and `AAAA gym -> <VPS IPv6>` if present). If Cloudflare: **DNS only (grey cloud)** so Caddy can get its certificate.

## 3. Deploy / update (as deploy)
```sh
git clone https://github.com/epipra/huru-gym.git ~/huru-gym   # first time
cd ~/huru-gym && git pull
cd deploy && cp -n .env.example .env && nano .env              # first time
APP_BUILD=$(git rev-parse --short HEAD) docker compose up -d --build
docker compose ps && docker compose logs --tail=50 api
```

## 4. First account (bootstrap)
1. `.env`: `INVITE_ONLY=0`, `FIRST_USER_ADMIN=1`. Deploy.
2. Open https://gym.adxfuel.com and create the owner account (becomes admin).
3. `.env`: `INVITE_ONLY=1`. `docker compose up -d`. Invite beta users from the admin dashboard.

## 5. Backups
`HURU_DATA_DIR` holds every account, passkey, workout and the session secret. Back it up nightly with restic to object storage (repository + password in `/root/.restic-env`, never in git):
```sh
# /etc/cron.d/huru-backup
30 3 * * * root . /root/.restic-env && restic backup /srv/huru-gym/data --tag huru && restic forget --keep-daily 14 --keep-weekly 8 --prune
```
Test a restore monthly: `restic restore latest --target /tmp/restore-test`.

## 6. Upstream releases
```sh
git fetch upstream --tags && git merge vX.Y.Z
sh deploy/sync-dockerfile.sh   # regenerate web/Dockerfile.huru
# run tests, then deploy (section 3)
```

## 7. Local machine (Docker Desktop) via Cloudflare Tunnel
For running on a PC without a public IP. adxfuel.com DNS is on Cloudflare, so no router changes.
1. Cloudflare dashboard (account **AdxFuel LLC**, the account that holds the adxfuel.com zone; a tunnel cannot serve a domain in another account) -> Zero Trust -> Networks -> Tunnels -> Create a tunnel -> Cloudflared,
   name `huru-gym`. Copy the token from the install command (the long string after `--token`).
2. Same tunnel -> Public hostnames -> Add: subdomain `gym`, domain `adxfuel.com`,
   service type `HTTP`, URL `caddy:80`. Cloudflare creates the DNS record itself.
3. Paste the token into `deploy/.env` as `TUNNEL_TOKEN=...` (never into chat or git).
4. From `deploy/`: `.\up-tunnel.ps1` (PowerShell) or
   `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`.
5. Open https://gym.adxfuel.com and continue with section 4.
**Moving to another domain** (done once, gym.epipra.com -> gym.adxfuel.com on 2026-10-12): every user sets a password first (Settings), because passkeys are bound to `RP_ID` and stop working on the new host; change `HURU_DOMAIN`, `RP_ID`, `ORIGIN`, `HURU_PRIVACY_URL`, `HURU_TERMS_URL` in `.env`; rebuild `web` and restart `api`; update the Stripe webhook URL and public details; add a Cloudflare redirect rule (301, keep path and query) on the old host. Users then sign in with their password and add a new passkey.

The site is only up while this PC and Docker Desktop are running. Data lives in the Docker volume
`huru-gym_huru_data`; back it up with:
`docker run --rm -v huru-gym_huru_data:/data -v ${PWD}:/backup alpine tar czf /backup/huru-data.tgz -C /data .`

## 8. Huru GYM Pro (Stripe)
The AI Coach needs Pro when `HURU_BILLING=1`; admins always have it. Code: `api/huru/`, `frontend/src/lib/huru-pro.js`, `frontend/src/components/HuruPro.jsx`.
1. Stripe dashboard (AdxFuel LLC), start in **Test mode**:
   - Product Catalog -> Add product `Huru GYM Pro` with two recurring prices: USD 5.99 monthly and USD 39.99 yearly. Copy both price IDs (`price_...`).
   - Developers -> API keys: copy the **Secret key** (`sk_test_...`).
   - Developers -> Webhooks -> Add endpoint `https://gym.adxfuel.com/api/huru/stripe/webhook`, events
     `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`. Copy its **Signing secret** (`whsec_...`).
   - Settings -> Billing -> Customer portal: enable it (cancel, switch plan, update card).
   - Settings -> Business -> Public details is **live mode only** (a sandbox refuses it with "Only live keys can access this method"). Set on 2026-10-12: public name AdxFuel LLC, support support@adxfuel.com / +1 307 396 4130, support URL `/legal/delete-account.html`, privacy and terms URLs on gym.adxfuel.com. These apply to the whole AdxFuel LLC Stripe account.
2. Put the four values into `deploy/.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`), then `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d api`.
3. Test with card `4242 4242 4242 4242`, any future date, any CVC, from a non-admin test profile.
4. Live: repeat step 1 in Live mode and swap the four values. Prices shown in the app come from
   `VITE_PRO_PRICE_MONTHLY` / `VITE_PRO_PRICE_YEARLY` at build time (defaults $5.99 / $39.99); keep them equal to Stripe.
5. Comp a tester: Admin dashboard -> tap the profile -> Huru GYM Pro -> Give 30 days / 90 days / 1 year (End free Pro to stop it). Same as `POST /api/huru/admin/grant {"uid": "...", "days": 30}`; one profile's state: `GET /api/huru/admin/pro?uid=...`, everyone with an entry: `GET /api/huru/admin/billing`.

## 9. Password-reset e-mail
"Forgot your password?" on the password sign-in sheet e-mails a one-time code (60 minutes, single
use) to the profile's sign-in e-mail; the user enters it on the same sheet with a new password.
Code: `api/huru/mail.js` (SMTP over TLS, no library), `POST /api/huru/password/forgot` in
`api/huru/routes.js`, `frontend/src/components/HuruForgot.jsx`. Only profiles with a password and
a sign-in e-mail (Settings -> Account) can use it; anyone else still gets an admin reset code.
1. Google Admin / Google Account of support@adxfuel.com: turn on 2-Step Verification, then
   Security -> App passwords -> create one named `huru-gym`.
2. Paste it into `deploy/.env` as `SMTP_PASS=` (`SMTP_USER` and `MAIL_FROM` are already there).
3. `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d api`.
4. Test: sign out, Sign in with password -> Forgot your password? -> your sign-in e-mail.
   A failed send is logged as `huru mail: reset code not sent: ...` (`docker logs huru-gym-api-1`).
Limits: 5 requests per network address and 3 per e-mail address an hour; Google allows about
2,000 messages a day per mailbox.

## 10. Backups (Cloudflare R2)
The `backup` service (`deploy/backup.sh`, rclone) uploads the whole data volume once a UTC day,
the first hour the machine is up that day, encrypted with `BACKUP_PASSPHRASE` (file names too),
to the private R2 bucket `huru-gym-backups` in the AdxFuel LLC Cloudflare account. It keeps 30 days
(`BACKUP_KEEP_DAYS`) and prunes old ones only after a new one has uploaded. Free under 10 GB.
1. Cloudflare (AdxFuel LLC) -> R2 -> Manage API Tokens -> Create API token: permission
   **Object Read & Write**, applied to bucket `huru-gym-backups` only, TTL forever.
2. Put its Access Key ID and Secret Access Key into `deploy/.env` (`R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`). `R2_ENDPOINT`, `R2_BUCKET` and a random `BACKUP_PASSPHRASE` are already there.
3. **Copy `BACKUP_PASSPHRASE` into your password manager.** Without it no backup can be decrypted;
   if this machine dies with the only copy, the backups are useless.
4. `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d backup`, then
   `docker logs huru-gym-backup-1` shows `ok: huru-data-YYYY-MM-DD.tgz ...`.

Check or run by hand (tunnel mode; drop the second `-f` on the VPS):
```
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml exec backup sh /backup.sh list
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml exec backup sh /backup.sh now
```
Restore (replaces all current data with the backup; take one first with `now`):
```
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml run --rm -v "${PWD}:/restore" backup get huru-data-YYYY-MM-DD.tgz
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml stop api
docker run --rm -v huru-gym_huru_data:/data -v "${PWD}:/restore" alpine sh -c "rm -rf /data/* && tar xzf /restore/huru-data-YYYY-MM-DD.tgz -C /data && ls /data"
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml start api
```
Delete the downloaded `.tgz` afterwards: it is the unencrypted data.

## 11. Container hardening
The api runs as `node` (uid 1000), not root, with `cap_drop: [ALL]` and `no-new-privileges`
(`docker-compose.yml`). The one-shot `data-perms` service runs `chown -R 1000:1000` on the data
volume before every api start, so data restored from a backup or written by an older root-run
api is handed over automatically. Consequence: the Coach's CLI runtimes ("Claude (Anthropic)"
and "Codex (OpenAI)" chips, `API_TARGET=coach`) refuse every job, because they need a root
server to drop to their own user. Use an API-key provider (OpenAI, Anthropic API, Gemini or an
OpenAI-compatible endpoint), as this deployment does, or remove the `user:` line to go back.

## 12. Android app
Built by GitHub Actions, not on this PC: Actions -> **Huru Android** -> Run workflow (or push a
tag `huru-android-v<anything>`). About 10-15 minutes; the run page then offers the artifact
`huru-gym-android-<run>` (a zip) with:
- `huru-gym-<version>.apk`: install on a phone (allow "install unknown apps" for the browser or
  file manager). Package `com.adxfuel.hurugym`, so it sits next to any openGym app.
- `huru-gym-<version>.aab`: the file Google Play takes (Play Console -> Test and release).
Both are signed with the **upload key** (`D:\DevOps\Huru GYM\secrets\`, not in git; same values
in the repo's Actions secrets `HURU_KEYSTORE_B64`, `HURU_KEYSTORE_PASSWORD`). Enrol in Play App
Signing on the first upload, so Google holds the key users' installs are verified against.
`versionCode` is the workflow run number, so every build can be uploaded after the last.

In the app: the first screen offers "Connect to my server", pre-filled with gym.adxfuel.com; the
code comes from the website, Settings -> Account -> Pair the mobile app. Passkeys do not work
inside the app (the WebView's origin is not gym.adxfuel.com); pairing is the sign-in.
Pro is not sold in the app (Google Play only allows Play Billing for digital subscriptions);
Pro bought on the web works in the app. Play Billing is a later step.
Build script: `brand/huru/android/build.sh` (needs JDK 21 + Android SDK to run elsewhere).

## 13. Uptime alert
UptimeRobot (free, account of support@epipra.com) checks `https://gym.adxfuel.com/api/health`
every 5 minutes as monitor **Huru GYM** and e-mails when it is down (any non-2xx: Cloudflare's
1033/530 tunnel error, or the api's 503 when it cannot write its data). The free plan probes
with HEAD, which the api does not answer, so Caddy passes `HEAD /api/health` on as a GET
(`@healthHead` in both Caddyfiles). On the VPS nothing changes: same URL.

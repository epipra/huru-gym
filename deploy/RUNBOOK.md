# Huru GYM - Server runbook

Beta host: `gym.epipra.com` on one Ubuntu 24.04 VPS, Docker Compose, Caddy for HTTPS.

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
At the DNS host for `epipra.com`: `A gym -> <VPS IPv4>` (and `AAAA gym -> <VPS IPv6>` if present). If Cloudflare: **DNS only (grey cloud)** so Caddy can get its certificate.

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
2. Open https://gym.epipra.com and create the owner account (becomes admin).
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
For running on a PC without a public IP. epipra.com DNS is on Cloudflare, so no router changes.
1. Cloudflare dashboard -> Zero Trust -> Networks -> Tunnels -> Create a tunnel -> Cloudflared,
   name `huru-gym`. Copy the token from the install command (the long string after `--token`).
2. Same tunnel -> Public hostnames -> Add: subdomain `gym`, domain `epipra.com`,
   service type `HTTP`, URL `caddy:80`. Cloudflare creates the DNS record itself.
3. Paste the token into `deploy/.env` as `TUNNEL_TOKEN=...` (never into chat or git).
4. From `deploy/`: `.\up-tunnel.ps1` (PowerShell) or
   `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`.
5. Open https://gym.epipra.com and continue with section 4.
The site is only up while this PC and Docker Desktop are running. Data lives in the Docker volume
`huru-gym_huru_data`; back it up with:
`docker run --rm -v huru-gym_huru_data:/data -v ${PWD}:/backup alpine tar czf /backup/huru-data.tgz -C /data .`

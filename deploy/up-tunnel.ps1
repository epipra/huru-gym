# Build and start Huru GYM on this machine behind Cloudflare Tunnel (see RUNBOOK section 7).
# Run from deploy/:  .\up-tunnel.ps1
$env:APP_BUILD = (git rev-parse --short HEAD)
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host 'compose failed'; exit 1 }
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml ps
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs --tail 20 cloudflared api

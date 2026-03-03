# Docker Operations

## Start full platform
`docker compose -f infra/docker/docker-compose.yml up --build`

## Run migrations only
`docker compose -f infra/docker/docker-compose.yml run --rm migrations`

## Seed sample data
`docker compose -f infra/docker/docker-compose.yml run --rm api sh -lc "cd /app/packages/db && bun run seed"`

## URLs
- Ecosystem landing (via reverse proxy): `https://secondbrain.lan`
- Finances panel: `https://secondbrain.lan/finances`
- API: `https://secondbrain.lan/api`
- Worker: `https://secondbrain.lan/worker`

## LAN DNS setup
You must map the unified hostname to this Mac's LAN IP in your router DNS (or Pi-hole/AdGuard):
- `secondbrain.lan -> <MAC_LAN_IP>`

Get the Mac LAN IP:
`ipconfig getifaddr en0`

If your router has no local DNS feature, add an entry in each client's hosts file.

## HTTPS in LAN
Caddy uses an internal CA (`tls internal`) for LAN HTTPS.

One-time per device, you must trust Caddy's root certificate:
- Export from container: `/data/caddy/pki/authorities/local/root.crt`
- Import and mark as trusted in each device/OS certificate store.

Without this trust step, browsers will show a certificate warning.

## Health and Metrics
- API: `/health`, `/ready`, `/metrics`
- Worker: `/health`, `/ready`, `/metrics`

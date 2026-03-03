# Docker Operations

## Start full platform
`docker compose -f infra/docker/docker-compose.yml up --build`

## Run migrations only
`docker compose -f infra/docker/docker-compose.yml run --rm migrations`

## Seed sample data
`docker compose -f infra/docker/docker-compose.yml run --rm api sh -lc "cd /app/packages/db && bun run seed"`

## URLs
- Finances panel (via reverse proxy): `http://finances.lan`
- API (via reverse proxy): `http://api.lan`
- Worker (via reverse proxy): `http://worker.lan`

## LAN DNS setup
You must map each hostname to this Mac's LAN IP in your router DNS (or Pi-hole/AdGuard):
- `finances.lan -> <MAC_LAN_IP>`
- `api.lan -> <MAC_LAN_IP>`
- `worker.lan -> <MAC_LAN_IP>`

Get the Mac LAN IP:
`ipconfig getifaddr en0`

If your router has no local DNS feature, add entries in each client's hosts file.

## Health and Metrics
- API: `/health`, `/ready`, `/metrics`
- Worker: `/health`, `/ready`, `/metrics`

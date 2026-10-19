# WhatsApp API Gateway

A modular-monolith MVP with one dashboard and REST API for WhatsApp messaging. Each device uses exactly one provider: Meta WhatsApp Cloud API or a separate experimental Baileys session. There is no hidden provider fallback or automatic attempt to connect the same number to both.

## Repository layout

```
web-kirimwa/
├── backend/   # Rust REST API (axum + sqlx/MySQL); runs migrations on startup
├── web/       # Next.js dashboard (Node 22, standalone output, Biome lint)
├── baileys/   # Experimental WhatsApp Web gateway (single index.js, Express)
└── docker-compose.yml
```

Host ports come from `.env` (`API_PORT` 8081, `WEB_PORT` 3003, internal
`BAILEYS_PORT` 4000); MySQL is not published to the host. Working rules for AI
agents and contributors are in `AGENTS.md`.

## Providers and limitations

- **Meta Cloud API:** Official Meta API. This MVP accepts a customer's Meta Phone Number ID and access token manually per device. Tokens are encrypted at rest with AES-256-GCM. Embedded Signup, token exchange/refresh, and Meta delivery-status webhooks are not implemented.
- **Baileys:** Separate experimental QR connection using a third-party WhatsApp Web library. It is not an official WhatsApp API and may disconnect or be restricted. Do not use it as a fallback for Meta or assume both can share a number.
- Provider acceptance does not guarantee delivery. Meta opt-in, templates, customer-service windows, pricing, and messaging limits still apply. This MVP applies an account limit of 50 attempted messages per moving 24-hour period; attempts are reserved in a per-user transaction so concurrent requests cannot bypass the cap.

References:

- [Meta WhatsApp Cloud API overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Meta send messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)
- [Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Meta messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Baileys GitHub repository](https://github.com/WhiskeySockets/Baileys) — third-party library, not affiliated with or authorized by WhatsApp.

The Baileys link documents the upstream library, not this application's internal gateway API. Gateway routes and callback behavior described below are implementation-specific.

## Requirements

- Rust toolchain, Visual Studio Build Tools with the **Desktop development with C++** workload (including a Windows SDK), Node.js/npm, and MySQL 8 for native local development on Windows.
- Docker Engine with Docker Compose v2 for container deployment.
- A DNS name and HTTPS reverse proxy for a public production deployment.
- A Meta developer/business setup and authorized WhatsApp Business assets to send using Meta.
- A WhatsApp account to pair by QR if you choose experimental Baileys.

For native local development on Windows, Laragon can provide MySQL; Docker is not required. For server/container deployment, Compose builds and runs MySQL, the Rust API, the Baileys gateway, and the Next.js dashboard. MySQL schema migrations run automatically when the API starts. Compose publishes only the API and dashboard ports, bound to loopback by default; the database and Baileys service are not published to the host.

## Run locally with Laragon MySQL (Windows)

1. Start MySQL in Laragon and create the database `wa_gateway` (for example in HeidiSQL/phpMyAdmin). The default Laragon `root` account with no password is used in the sample connection string; change `LOCAL_DATABASE_URL` in `.env` if your MySQL user/password/port differs.
2. Copy `.env.example` to `.env` at the repository root, then configure the required random secrets. After the Windows C++ build tools are installed, generate the initial admin hash locally:

   ```powershell
   Set-Location backend
   cargo run -- hash-admin-password
   Set-Location ..
   ```

   Enter a 12–72 byte password at the hidden prompt and copy the resulting hash into `.env`, keeping it single-quoted. Keep Docker credentials in `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_ROOT_PASSWORD`; local Rust uses `LOCAL_DATABASE_URL` instead.
3. Make sure `WEB_ORIGIN` matches the local dashboard origin, and set `NEXT_PUBLIC_API_URL`, `API_BIND`, `API_PORT`, `WEB_BIND`, `WEB_PORT`, `BAILEYS_PORT`, `BAILEYS_GATEWAY_URL_LOCAL`, and `BACKEND_STATUS_WEBHOOK_BASE_LOCAL` in `.env`. The checked-in sample uses ports 3003, 8081, and 4000.
4. Install the JavaScript dependencies once:

   ```powershell
   Set-Location web
   npm ci
   Set-Location ..\baileys
   npm ci --legacy-peer-deps
   Set-Location ..
   ```

5. Open three VS Code terminals at the repository root and run one command in each:

   ```powershell
   .\scripts\run-local.ps1 api
   .\scripts\run-local.ps1 web
   .\scripts\run-local.ps1 baileys
   ```

   The API applies database migrations on startup. Open the `WEB_ORIGIN` URL (sample: `http://localhost:3003`) and sign in using `BOOTSTRAP_ADMIN_EMAIL` and the password used to generate its BCrypt hash. The local runner reads `.env`; the same file also supplies configuration to Docker Compose, while Compose continues using its internal service URLs and its own MySQL container.

To stop local services, press `Ctrl+C` in each terminal. Baileys credentials are saved under `baileys/auth_info`; this directory is ignored by Git.

## First-time server setup

These commands are for a Linux server shell (Ubuntu/Debian examples). `.env` is server-specific and is not committed to Git.

1. Install Docker Engine/Compose v2, then clone the repository:

   ```sh
   git clone https://github.com/ZepiDarmawanTambunan/web-kirimwa.git
   cd web-kirimwa
   cp .env.example .env
   ```

2. Generate strong random secrets. Run this command separately for `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `WEBHOOK_SECRET`, `GATEWAY_TOKEN`, and `DEVICE_CREDENTIALS_KEY`; copy each output into its matching `.env` entry. The hex output is URL-safe and 64 characters long:

   ```sh
   openssl rand -hex 32
   ```

   `DEVICE_CREDENTIALS_KEY` must remain backed up and unchanged: changing or losing it makes saved Meta access tokens unreadable. Keep `.env` private and restrict it to the deployment operator.

3. Set `BOOTSTRAP_ADMIN_EMAIL` in `.env`. Generate the BCrypt hash for the admin password without putting the plaintext password in `.env`:

   ```sh
   docker compose build api
   docker compose run --rm --no-deps api hash-admin-password
   ```

   Enter a password of 12–72 bytes at the hidden prompt. Put the resulting hash in single quotes in `.env`, for example `BOOTSTRAP_ADMIN_PASSWORD_HASH='$2b$12$...'`. Compose may interpolate `$` in unquoted values, so do not paste the hash unquoted or alter the generated hash. Keep the password in your password manager. Production Compose explicitly uses `APP_ENV=production` and requires a valid email/hash pair; there are no built-in demo admin credentials. The seed creates this administrator only when its email does not already exist; later environment changes do not reset an existing account's password. Do this before the first application startup.

4. For container access, keep the `.env.example` defaults for `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`, `COOKIE_SECURE`, and ports. Start the app:

   ```sh
   docker compose up -d --build
   docker compose ps
   docker compose logs -f api web baileys
   ```

   Open `http://localhost:3003` on the server. If accessing from another machine, configure an HTTPS reverse proxy rather than exposing application ports directly.

5. Sign in using the email and password you set in steps 3. Then go to **Koneksi WhatsApp**, add a device, and choose one provider:
   - **Meta Cloud API:** enter the authorized Phone Number ID and access token.
   - **Baileys:** create a separate device and scan its QR code.

   Select that connection in the dashboard, enter the recipient's full international number (for example `628123456789`), and send. `Accepted` means the provider accepted the request; it is not delivery confirmation.

To stop or upgrade while retaining data:

```sh
docker compose down
git pull
docker compose up -d --build
docker compose logs -f api
```

Do **not** use `docker compose down -v` unless you intend to permanently delete the MySQL and Baileys session volumes. Back up the MySQL volume and `.env` (especially `DEVICE_CREDENTIALS_KEY`) before server migration or rebuild.

### Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `MYSQL_DATABASE` | No | Database name; defaults to `wa_gateway`. |
| `MYSQL_USER` | No | Application database user; defaults to `wa_gateway`. |
| `MYSQL_PASSWORD` | Yes | Application database password. Use URL-safe random hex as generated above. |
| `MYSQL_ROOT_PASSWORD` | Yes | MySQL root password; use a different random value. |
| `APP_ENV` | Yes | `development` for local native runs; Compose explicitly sets `production` and requires an initial admin email/hash. |
| `LOCAL_DATABASE_URL` | Local only | MySQL connection used by `scripts/run-local.ps1`; sample targets Laragon `root` with no password at `127.0.0.1:3306`. |
| `JWT_SECRET` | Yes | Session signing key, at least 32 bytes. |
| `WEBHOOK_SECRET` | Yes | Secret segment for the internal Baileys status callback. |
| `GATEWAY_TOKEN` | Yes | Shared secret between the API and the internal Baileys service. |
| `DEVICE_CREDENTIALS_KEY` | Yes | Exactly 32 random bytes encoded as 64 hex characters; encrypts Meta tokens at rest. |
| `BOOTSTRAP_ADMIN_EMAIL` | Yes | Email for the initial admin account. |
| `BOOTSTRAP_ADMIN_PASSWORD_HASH` | Yes | BCrypt hash produced by `hash-admin-password`; never put the plaintext password here. |
| `META_GRAPH_API_VERSION` | No | Meta Graph API version; defaults to `v24.0`. Set one currently supported by your Meta app. |
| `WEB_ORIGIN` | Yes for production | Exact browser origin allowed by the API. Use `https://your-domain` in production. |
| `NEXT_PUBLIC_API_URL` | Yes for production | Public API base URL embedded during frontend build. For a same-origin reverse proxy, use `https://your-domain`. |
| `COOKIE_SECURE` | Yes for production | Set `true` behind HTTPS; local HTTP uses `false`. |
| `API_BIND`, `API_PORT` | Yes | Host interface/port for API; the sample binds `127.0.0.1:8081`. |
| `WEB_BIND`, `WEB_PORT` | Yes | Host interface/port for dashboard; the sample binds `127.0.0.1:3003`. |
| `BAILEYS_PORT` | Yes | Local/Docker gateway port; the sample uses `4000`. |
| `BAILEYS_GATEWAY_URL_LOCAL`, `BAILEYS_GATEWAY_URL_DOCKER` | Yes | API-to-gateway URLs for native and Compose runs, respectively. |
| `BACKEND_STATUS_WEBHOOK_BASE_LOCAL`, `BACKEND_STATUS_WEBHOOK_BASE_DOCKER` | Yes | API base URLs used to construct the internal Baileys status callback URL. |

`DATABASE_URL` is assembled by Compose from the MySQL variables and the internal service name `mysql`; do not set it to `localhost` in `.env`. Keep the default database/user names or use simple URL-safe names.

## Public HTTPS deployment

Point DNS to the server, terminate TLS at a reverse proxy such as Nginx/Caddy, and keep both `API_BIND` and `WEB_BIND` at `127.0.0.1`. Set these `.env` values, replacing the example host:

```dotenv
WEB_ORIGIN=https://wa.example.com
NEXT_PUBLIC_API_URL=https://wa.example.com
COOKIE_SECURE=true
API_BIND=127.0.0.1
API_PORT=8081
WEB_BIND=127.0.0.1
WEB_PORT=3003
```

For a same-origin Nginx site, proxy `/api/` and `/healthz` to `http://127.0.0.1:8081`, and all other paths to `http://127.0.0.1:3003`. Preserve the request `Host` header and configure TLS certificates. After changing `NEXT_PUBLIC_API_URL`, rebuild the web image:

```sh
docker compose up -d --build
```

Configure firewall rules to allow HTTPS but not direct public access to ports 3003/8081 or to MySQL. Configure proxy access logs to avoid recording the secret webhook path. Use HTTPS only for public access.

## API

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- `POST /api/v1/auth/api-key` — issue/rotate a user API key (shown once).
- `GET /api/v1/devices`, `POST /api/v1/devices` — list/add provider-specific devices (dashboard session).
- `POST /api/v1/devices/{id}/connect`, `GET /api/v1/devices/{id}/status`, `DELETE /api/v1/devices/{id}` — Baileys pairing/status and device deletion.
- `POST /api/v1/messages` — send via the selected device. A `Bearer` API key or dashboard session is accepted:

  ```json
  { "device_id": "device-uuid", "target": "628123456789", "message": "Hello" }
  ```

- `GET /api/v1/messages`, `GET /api/v1/messages/{id}` — user's message history/status.
- `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/{id}` — admin-only account management.
- `POST /api/v1/webhooks/gateway/{secret}` — internal Baileys status callback.
- `GET /healthz` — API health check.

## Security and limitations

Seeded admin passwords are BCrypt-hashed; registered user passwords use Argon2. User API keys are SHA-256 hashed. Meta access tokens are encrypted with AES-256-GCM and `DEVICE_CREDENTIALS_KEY`, and never returned to the frontend. The Baileys HTTP service is only on the internal Docker network and requires `GATEWAY_TOKEN`.

Email ownership, Meta Embedded Signup, token refresh, and Meta delivery-status webhooks are not implemented. Meta service messages are subject to official WhatsApp user opt-in and customer-service-window/template rules. Baileys is nonofficial and experimental; review its compliance and account risks before use.

## Verification

Run from the repository root:

```sh
cd backend
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cd ../web
npm ci
npm run lint
npm run typecheck
npm run build
cd ../baileys
node --check index.js
cd ..
docker compose config
```

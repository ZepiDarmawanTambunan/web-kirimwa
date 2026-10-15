# WhatsApp API Gateway

A modular-monolith MVP for sending WhatsApp messages through the independent Baileys gateway. Rust/Axum owns authentication, user API keys, message persistence, and the gateway configuration; Next.js provides the dashboard.

## Implemented scope

- Email/password registration and login; a local admin account is seeded at startup with BCrypt-hashed password data.
- One API key per account, displayed only when created or rotated.
- Dashboard message sending/history and a REST API at `/api/v1`.
- Baileys independent gateway (local QR, tanpa Fonnte). Gateway webhook (`/api/v1/webhooks/gateway/{secret}`) menerima callback status pengiriman. Limit harian 50 pesan per user dalam 24 jam diterapkan untuk developer.
- MySQL migrations, Docker Compose, validation, structured error responses, and backend tests.

Independent gateway references, verified 2026-10-15:

- [Sending API Messages](https://docs.baileys.example) — independent Baileys gateway, `target`, `message`, and the `Authorization` header carrying the token directly (not Bearer).
- [API Check Message Status](https://docs.baileys.example) — marks independent gateway endpoint deprecated and directs users to webhooks.
- [Webhook Update Message Status](https://docs.baileys.example) — status callback fields include `id`, `stateid`, `status`, and `state`.
- [Message status values](https://docs.baileys.example) — documented status names.
- [Token (API key)](https://docs.baileys.example) — Service provider warns that the token permits sending messages and must be stored securely.

## Install and run locally

### Requirements

- Docker Desktop with Docker Compose v2, running.
- A Baileys-connected WhatsApp session (via QR) to send real messages. The app can start with the example token, but message sending will not work until it is replaced.

### Windows PowerShell / VS Code

1. Clone the repository and open its folder in VS Code:

   ```powershell
   git clone https://github.com/ZepiDarmawanTambunan/web-kirimwa.git
   cd web-kirimwa
   code .
   ```

2. In the VS Code terminal, create your private local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Open `.env` and replace the example MySQL passwords, `JWT_SECRET`, `WEBHOOK_SECRET`, and `GATEWAY_TOKEN` with your own values. Keep `.env` private; it is excluded from Git. Admin login credentials are seeded by `backend/src/seeds.rs`, not from `.env`.
4. Start the app from the project root:

   ```powershell
   docker compose up --build
   ```

   The first build may take several minutes. Keep this terminal open while using the app.

5. Open <http://localhost:3000> and sign in using the local demo account below.

To stop the services, press `Ctrl+C` in the terminal. You can start them again with `docker compose up`; `docker compose down` stops and removes containers while retaining the MySQL data volume.

### Local demo account

- **Email:** `admin@example.com`
- **Password:** `Admin123!`

This fixed, public credential is for **local testing only**. Never deploy it on a public or production service. Change the email/password seed in `backend/src/seeds.rs` before using a shared deployment. The seed creates the admin only if the email is not already present as an admin; it does not reset an existing account's password.

### Quick usage

1. Sign in to the dashboard with the local demo account.
2. Enter the recipient's full international number (for example, `628123456789`) and message, then send.
3. Review message history and status in the dashboard. Real delivery requires Baileys QR login in the backend environment.
4. For delivery status callbacks, configure the gateway webhook URL as `https://YOUR_PUBLIC_HOST/api/v1/webhooks/gateway/WEBHOOK_SECRET`, using the same secret as `WEBHOOK_SECRET`. A local service is not publicly reachable; expose it through a properly secured public HTTPS endpoint to receive callbacks.

For development without Docker, run MySQL 8.4, set the backend environment variables from `.env`, start the API from `backend` with `cargo run`, then start the dashboard from `web` with `npm ci` and `npm run dev`.

## API

- `POST /api/v1/auth/register` — create a user account.
- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- `POST /api/v1/auth/api-key` — issue/rotate an account API key (shown once).
- `POST /api/v1/messages` — send one or more comma-separated international targets with `Authorization: Bearer <account-api-key>`. The dashboard may send using its authenticated session.
- `GET /api/v1/messages` — return the latest 50 messages (up to 100 via `?limit=100`).
- `GET /api/v1/messages/{id}` — retrieve one message's latest delivery status using the local ID returned by send.
- `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/{id}` — admin-only account listing and activation control.
- `POST /api/v1/webhooks/gateway/{secret}` — gateway status callback; do not expose or log the secret.
- `GET /healthz` — process health check.

Send request JSON (provide a complete international number with country code; a leading `+` is accepted):

```json
{ "target": "628123456789", "message": "Hello" }
```

Auth redirect modern menggunakan `cookies()` server-side (Next.js App Router). Error handling lengkap: `404` dan `500` pages tersedia.

Backend errors use `{"error":{"code":"...","message":"..."}}`. Seeded admin passwords are BCrypt-hashed; newly registered account passwords use Argon2, and existing Argon2 passwords remain supported. User API keys are stored as SHA-256 hashes. The gateway token is read only by the API service and is never sent to the browser or logged. Email ownership is not verified in this MVP. Put the services behind HTTPS and a reverse proxy with request-size/rate limits in production; redact the secret webhook URL from access logs and set `COOKIE_SECURE=true`.

## Verification

Run backend tests with `cargo test` in `backend`; run frontend checks with `npm run lint`, `npm run typecheck`, and `npm run build` in `web`. Docker Compose can be validated with `docker compose config`.

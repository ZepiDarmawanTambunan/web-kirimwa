# AUDIT CHECKLIST WEB-KIRIMWA

## 1. BACKEND RUST
- [ ] config.rs: gateway_token, database_url, cookie_secure
- [ ] services/mod.rs: wa_gateway (tidak fonnte)
- [ ] services/wa_gateway.rs: independent gateway
- [ ] handlers/messages.rs: limit 50/24 jam, wa_gateway::send
- [ ] handlers/auth.rs: register/login/logout/me/api-key
- [ ] handlers/webhooks.rs: gateway_status (tidak fonnte)
- [ ] main.rs: route gateway webhook
- [ ] middleware.rs: session_auth, message_auth
- [ ] repository/messages.rs: insert_many, set_failed, count_recent_24h
- [ ] migrations: database schema ok

## 2. FRONTEND NEXT.JS
- [ ] page.tsx: auth redirect server-side (cookies)
- [ ] login/page.tsx: register, error display
- [ ] dashboard.tsx: send, refresh, api-key, admin, error UI
- [ ] layout.tsx: metadata bersih
- [ ] lib/api.ts: error messages (400/401/404/500)
- [ ] not-found.tsx: halaman 404
- [ ] error.tsx: halaman 500

## 3. BAILEYS
- [ ] Dockerfile: git install, npm install
- [ ] package.json: baileys + express
- [ ] index.js: makeWASocket, QR print, status endpoint
- [ ] .env.example: GATEWAY_TOKEN, port 4000

## 4. DOCKER / INFRA
- [ ] docker-compose.yml: mysql:8.0, api:8081, web:3003, baileys:4000
- [ ] .env: lengkap, tanpa FONNTE_TOKEN
- [ ] README.md: bersih dari fonnte
- [ ] Tidak bentrok port dengan proyek lain

## 5. TESTING OUTPUT REAL
- [ ] docker compose config: OK
- [ ] docker ps -a: semua Up
- [ ] curl localhost:3003/: redirect atau 200
- [ ] curl localhost:8081/healthz: 200
- [ ] curl localhost:4000/status: 200
- [ ] Log baileys: QR muncul atau "ready"

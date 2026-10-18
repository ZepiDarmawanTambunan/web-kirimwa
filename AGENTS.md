# AGENTS.md — web-kirimwa

Panduan kerja untuk agent AI (dan manusia) di repo ini. Baca sebelum menulis kode.

## 1. Fakta repo

- Remote: `git@github.com:ZepiDarmawanTambunan/web-kirimwa.git` — branch kerja: `main`
- Tiga komponen dalam satu repo:
  - `backend/` — REST API Rust (axum 0.8, sqlx/MySQL 8, jsonwebtoken, aes-gcm, argon2), entrypoint `src/main.rs`, migrasi sqlx di `backend/migrations/`
  - `web/` — dashboard Next.js (Node 22, output `standalone`, lint pakai **Biome**)
  - `baileys/` — gateway WhatsApp Web (`@whiskeysockets/baileys` 6.7, Express, satu file `index.js`)
- Database: MySQL 8.0, schema default `wa_gateway`
- Port host (dari `.env`): api `8081` -> 8080, web `3003` -> 3000, baileys `4000` (internal), mysql tidak dipublish
- Health: api `GET /healthz`, baileys `GET /status`, web `GET /` (redirect `/login`)

## 2. Menjalankan (Docker Compose)

```bash
cp .env.example .env       # WAJIB: compose memakai ${VAR:?Set ... in .env} untuk banyak var
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8081/healthz
curl -fsS http://127.0.0.1:4000/status
docker compose logs -f --tail=50 api      # atau web / baileys
```

Var `.env` yang dipakai compose: `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`,
`MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `WEBHOOK_SECRET`, `GATEWAY_TOKEN`,
`DEVICE_CREDENTIALS_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD_HASH`,
`WEB_ORIGIN`, `COOKIE_SECURE`, `API_BIND`, `API_PORT`, `WEB_BIND`, `WEB_PORT`,
`BAILEYS_PORT`, `BAILEYS_GATEWAY_URL_DOCKER`, `BACKEND_STATUS_WEBHOOK_BASE_DOCKER`,
`NEXT_PUBLIC_API_URL`. `.env` di-gitignore — **jangan pernah commit**.

## 3. Gate wajib sebelum commit (harus hijau)

```bash
# backend (Rust)
cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --locked

# web (Next.js) — generate prisma tidak ada di sini; cukup npm ci bila node_modules belum ada
cd web && npx biome lint . && npx tsc --noEmit && NEXT_PUBLIC_API_URL=http://localhost:8081 npm run build

# baileys
node --check baileys/index.js
```

CI: `.github/workflows/ci.yml` (3 job: `backend`, `web`, `baileys`).

## 4. Database & migrasi

- Migrasi sqlx bernama timestamp di `backend/migrations/` (`20261015000000_initial.sql`, ...). Dijalankan otomatis oleh API saat start.
- Migrasi yang sudah ter-apply tidak boleh diedit — tambahkan file baru dengan timestamp lebih besar.
- `backend/src/seeds.rs` mengisi data awal/idempoten; jangan menaruh `DROP`/`TRUNCATE` data nyata di seed.

## 5. Aturan wajib

Lakukan:
- Periksa kode yang ada dulu; ikuti pola `handlers/` + `services/` + `repository/` yang sudah ada di backend.
- Perubahan kecil dan terfokus; satu commit satu tujuan.
- Sertakan hasil gate di laporan (perintah + exit code).
- Setiap perubahan kontrak API harus ikut memperbarui `web/app/docs/` (halaman Dokumentasi REST API) pada commit yang sama.

Jangan:
- Rewrite besar, ganti struktur folder, atau tambah dependency tanpa alasan yang dijelaskan dulu.
- Ubah skema DB tanpa file migrasi baru.
- Menulis, mencatat, atau mencetak kredensial/token/session cookie (termasuk di log & laporan).
- Mengklaim "sudah diuji" kalau belum dijalankan.
- Menaruh fallback diam-diam antara provider Meta dan Baileys — satu device satu provider (lihat README).

## 6. Konvensi commit

Format: `<tipe>(<scope>): <ringkasan>`, scope dipakai di repo ini: `web`, `api`, `baileys`.
Contoh nyata: `fix(baileys): QR ulang saat koneksi perangkat putus + log bersih`, `refactor(web): rapikan UI/UX, responsivitas, state, dan aksesibilitas`.

## 7. Definisi selesai

1. Gate bagian 3 hijau.
2. Perubahan diverifikasi pada stack yang jalan (`docker compose up -d --build` + hit endpoint/UI terkait), bukan hanya kompilasi.
3. `git status` bersih setelah commit, tidak ada `.env`/kredensial ikut.
4. Untuk perubahan UI: cek juga state loading/empty/error dan aksesibilitas (fokus keyboard, label).

## 8. Jebakan yang diketahui

- Build image `web` memakai build-arg `NEXT_PUBLIC_API_URL`; salah nilai = dashboard memanggil API yang salah.
- `baileys` menyimpan kredensial sesi di volume `baileys_auth`; memutus sesi permanen (kode 401/403/411/500) memicu reset kredensial + QR baru, sedangkan gangguan sementara hanya reconnect bertingkat (maks 8 percobaan).
- `COOKIE_SECURE=false` diperlukan kalau diakses lewat http/IP lokal; `true` hanya untuk HTTPS.
- Compose service `api` menunggu `mysql` **dan** `baileys` sehat sebelum start.
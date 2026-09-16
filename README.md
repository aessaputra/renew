# Renew

Personal frontend using SvelteKit, Svelte, TypeScript, and Tailwind CSS.
Single-owner Wallos subscription dashboard protected by Pocket ID OIDC.

## Running locally

Use Node.js 24 LTS and npm. Lockfile included for consistent installs.

```sh
npm ci
npm run dev
```

Open the local address shown in the terminal.

## Authentication

Pocket ID OIDC Authorization Code + PKCE S256 only; no local password.
Copy `.env.example` to `.env` (git-ignored) and fill in values; never commit `.env`.

```sh
cp .env.example .env
npm start
```

- `ORIGIN` must be the exact public HTTPS URL (e.g. `https://subscriptions.example.com`).
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ALLOWED_SUB` come from Pocket ID. Only the allowed subject gets a session.
- `SESSION_SECRET` signs stateless session cookies (at least 32 bytes, e.g. `openssl rand -base64 32`). Sessions and login transactions survive across serverless instances; restart no longer clears them.
- Sessions use idle (7 days) plus absolute (30 days) expiry. Active use reissues the cookie; 7 days idle or 30 days total forces login. Logout clears the browser cookie only; there is no server-side revocation. Login transactions are single-use at the IdP auth-code level but the cookie itself is bearer within its 5-minute window.
- Rotating `SESSION_SECRET` invalidates all sessions at once. The first deploy after this change logs everyone out once (old opaque cookies are rejected and cleared).
- Logout is local only: `POST /auth/logout` ends the Renew session; the Pocket ID session stays active.
- Missing or invalid config fails closed with 503 on private routes and login.

## Subscriptions

Set `WALLOS_BASE_URL` and `WALLOS_API_KEY` in `.env`. The key stays on the server;
Wallos requests time out after 10 seconds. Missing configuration fails closed.

| Route | Purpose |
|---|---|
| `/` | Active subscriptions, name search, category and payment filters |
| `/subscriptions/[id]` | Details and deletion |
| `/subscriptions/new` | Add a subscription |
| `/subscriptions/[id]/edit` | Edit a subscription and reminders |

Forms work without JavaScript. Search and filters require JavaScript.
Categories, payment methods, currencies, and notification channels remain managed
in Wallos. Cycle and frequency show Wallos numeric values; their labels are not assumed.
Tests use local mock services and never modify production subscriptions.

## Verify and build

```sh
npm run check
npm run lint
npm run build
npm test
npm run preview
```

`check` runs Svelte and TypeScript checks. `lint` runs ESLint (Svelte + TS).
`test` builds then runs all unit and integration suites: authentication, validation,
filtering, and subscription CRUD through local mock services.
`preview` only checks the build locally, not the production server.

## Batas scope

- `openapi.yaml` dipertahankan sebagai referensi kontrak API.
- Dashboard mencakup daftar, pencarian, filter, detail, tambah, edit, dan hapus subscriptions.
- Tidak ada pengelolaan kategori, metode pembayaran, mata uang, atau pembayar di Renew.
- Pengaturan kanal notifikasi tetap di Wallos utama.
- Jangan memasukkan API key ke kode browser atau version control.
- Sebelum deployment publik, konfigurasi autentikasi akses dan adapter produksi sesuai lingkungan hosting.

Konfigurasi SvelteKit dan Tailwind berada di `vite.config.ts` sesuai scaffold resmi.
Tidak ada perubahan konfigurasi ECC global.

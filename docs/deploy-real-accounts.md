# Real accounts on the deployed site

The Vercel deployment only serves the Vite build; it has no API. For `/signup`
to create an account that survives a refresh, three things must be true:

1. an Express API is reachable over HTTPS,
2. that API is pointed at a real database (Supabase),
3. the built frontend knows the API's URL (`VITE_API_URL`).

Signup goes: browser → `POST {VITE_API_URL}/auth/register` → Supabase
`auth.users` + `public.users` → JWT in `vl_token`.

## Services and keys needed

| service | what it is for | keys |
|---|---|---|
| **Supabase** | users and vaults (real persistence) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Render** | hosts the Express API | none to paste; the blueprint generates `JWT_SECRET` |
| **Vercel** | hosts the SPA; needs the API URL at build time | `VITE_API_URL` |
| **PayPal** (sandbox) | order / authorize / capture on the payments flow — not needed for signup | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, optional `PAYPAL_WEBHOOK_ID` |

No keys are present in this repository: `backend/.env` contains only
`NODE_ENV PORT FRONTEND_URL JWT_SECRET USE_IN_MEMORY_DB`, and there is no
root `.env`. Secrets belong in the Render dashboard (or the blueprint's
**sync: false** prompts), never in a committed file.

## Step 1 — Supabase

1. Create a project at supabase.com; copy the **Project URL** and the
   **service_role** key (Settings → API). The service role key is required:
   registration calls `auth.admin.createUser` and inserts the profile row.
2. Open **SQL Editor** and run `backend/prisma/vaultpay_final_schema.sql`.
   It creates the eleven tables the API expects: `users`, `vaults`,
   `vault_members`, `agreements`, `milestones`, `vault_files`, `approvals`,
   `ledger_events`, `paypal_transactions`, `verification_runs`, `webhook_events`.
   The file defines no RLS policies; the API is the only writer and uses the
   service role key, so that is fine.
3. Leave email confirmation alone — the API creates users with
   `email_confirm: true`.

## Step 2 — Render (the API)

The repo ships `render.yaml`. Either create the service from the blueprint
(New → Blueprint) or configure a Web Service by hand:

| setting | value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

`npm start` runs `tsx src/index.ts`. `tsx` is now a **dependency**, not a dev
dependency, so `npm ci` installs it even when `NODE_ENV=production`.

Environment variables:

```
NODE_ENV=production
FRONTEND_URL=https://vault-lance-ai.vercel.app
JWT_SECRET=<long random value>          # blueprint generates one
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Optional, for the payment flow: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
`PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`, `PAYPAL_WEBHOOK_ID`.

Do **not** set `USE_IN_MEMORY_DB=true`: that disables Supabase and every account
disappears on restart.

Verify from a shell:

```bash
curl -s https://<service>.onrender.com/health
curl -s -X POST https://<service>.onrender.com/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"DeployPass123!","fullName":"Your Name","role":"FREELANCER"}'
```

The second call must answer `201` with `data.token`; the same email must appear
in Supabase → Authentication → Users and in `public.users`.

## Step 2b — Fly.io instead of Render

The repo ships `Dockerfile` and `fly.toml` for the API. There is deliberately no
`[deploy] release_command`: this service has no migrations of its own (Supabase
owns the schema), and a release command that waits on a database it cannot reach
is what aborts a deploy with `release_command failed ... exit code 1`.

The image runs `npm start` (`tsx src/index.ts`) on port 8080, which is also the
`internal_port` and the `PORT` the API reads.

```bash
fly secrets set \
  JWT_SECRET=$(openssl rand -hex 32) \
  SUPABASE_URL=https://<project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service role key> \
  FRONTEND_URL=https://vault-lance-ai.vercel.app \
  -a vaultlance-ai

fly deploy -a vaultlance-ai
```

If the app's own `fly.toml` (the one Fly generated) still has a
`[deploy] release_command` line, delete it or deploy with this repo's file.
`fly secrets set` does not take a client IP; the health check is `GET /health`.

## Step 3 — Vercel (the frontend)

1. Settings → Environment Variables → add
   `VITE_API_URL=https://<service>.onrender.com/api` (note the `/api` suffix).
2. Redeploy. Vite inlines env vars at build time, so an existing deployment does
   not pick it up.
3. Load `/signup` and create an account. The card's footnote reads
   `AUTHENTICATED VAULT`; `DEMO MODE ACTIVE` means the build still has no API URL
   (or the variable was added after the build).

CORS is handled: the API allows `FRONTEND_URL` and has a permissive dev
fallback, so the Vercel origin is accepted.

## What a restart does

Sessions live in the API's memory, but the JWT is signed and
`validateTokenAndSession` recreates a missing session from a valid token when
Supabase is configured (`backend/src/auth/auth.service.ts`). So a Render restart
logs nobody out permanently; without Supabase, both the account and the session
are gone.

Uploaded files are written to `storage/vaults` on the instance's disk, which
Render does not keep across deploys. That affects deliverables, not signup.

## Order of operations

Signup works the moment steps 1–3 are done. Nothing in the frontend needs a code
change: `src/lib/apiClient.ts` already prefers `VITE_API_URL`, and only falls back
to the deployment's own `/api` (then demo mode) when it is absent.

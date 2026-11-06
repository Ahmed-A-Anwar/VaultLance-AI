# 00 — Inventory

Audit date: 2026-11-06. Worktree clean on `main` at `e7897cd` (`git log -1`: 2026-11-05 19:51:02 +0200).
Everything below was read or run in this session. No secret values are reproduced anywhere in `docs/audit/`.

## 1. Repo map

| Area | Path | Stack | Size | Notes |
|---|---|---|---|---|
| Frontend SPA | repo root (`src/`, `index.html`, `vite.config.ts`) | React 19, Vite 6, TypeScript 5.8, Tailwind 4, react-router 7, AG Grid 36, GSAP/motion/lenis, PayPal JS SDK, Supabase JS, fflate, qrcode, sharp | `src` 1.7 MB, 192 files; `public` 21 MB; `dist` 24 MB | `package.json` scripts: `typecheck`, `test:unit` (vitest), `test:e2e` (playwright), `build` |
| Express API | `backend/` | Express 5, TypeScript run through `tsx` (no build step), Supabase REST + `pg`, `adm-zip`, `bcryptjs`, `jsonwebtoken`, `multer`, `helmet`, `zod` | `backend/src` 455 KB, 72 files | `@prisma/client` + `prisma` are declared but never imported (`grep -rn "PrismaClient" backend/src` → no hits) |
| AI engine | `vaultpay_m3_ai_engine/` | FastAPI 0.111, SQLAlchemy async, Anthropic SDK, Elasticsearch, Celery/Redis in requirements | 392 KB, 34 `.py` files | Called by the API only from `GET /api/ai/health` (`backend/src/ai/ai.routes.ts:18`) |
| Delivery copies | `steps/` | 8 step folders, docs + duplicate source | 52 tracked files | Duplicate of the same code, historical |
| Screenshots | `.shots/` | PNG/WebP | 321 tracked files | Committed capture artefacts |
| Postman | `postman/`, `.postman/` | PayPal sandbox collection + environments | 14 YAML files | `01`–`11` requests, payout subfolder |
| Scripts | `scripts/`, root `*.mjs` | Node helper scripts (clip manifest, verify run) | — | `gen:clips` runs on `predev`/`prebuild` |
| Docs | `docs/` | design + deploy + decisions | ~19 files | `PLAN.md`, `phase2-map.md`, `decisions.md`, deploy guides |
| Tests | `tests/` (17 Playwright specs), `backend/tests/` (12 vitest files), colocated `*.test.ts` in `src` | — | 142 Playwright tests | — |

No CI configuration exists: `glob **/*.yml` matched only Postman collections and environments, and there is no `.github/` directory.

## 2. Git state

- Branch: `main`, working tree clean (`git status --porcelain` empty).
- Last 30 commits (one line each, newest first):
  `e7897cd`, `27aff03` (ledger mapping fixes), `2fb09ae`, `c82698b` (PayPal ids on read), `45e2b61`, `44324c1` (server-side claim), `508eff2`, `9181b4a`, `f54e488` (PayPal return handling), `f1e3724`, `52c4581` (scoped ledger, payout retry), `987de7f`, `a7b6872` (phase-2 merges), `661d4dd`, `c5aa254`, `61f3171` (auth on a real authorization), `f20a08a`, `7690cd7`, `cb27822`, `8460e8c`, `584f362`, `9a1d81e`, `ff5a0a7`, `665338e`, `a10e85c`, `d3b0723`, `cf3bcee`, `44de4ee`, `34e1876`, `1069a32`.
- Tags: 20+, all pre-release/checkpoint (`phase1-pre`, `phase2-pre`, `hero-v6-pre-type`, `fdash-v2-stable`, `pay-v0-pre`, …). No semantic release tag.
- Branches: ~30 local feature branches, several never merged (`feat/audit-room`, `feat/client-dashboard`, `feat/payments-page`, `feat/settings`, `feat/phase1-money-loop`, …). Two branch names are mojibake (`feat/paypal-postmaظ‰`, `feat/paypal-postmaى`) — probably a Windows encoding accident.
- Noisy/duplicated material in the tree: `steps/` (52 files of duplicated delivery code), `.shots/` (321 committed screenshots), `backup/` (untracked), `.postman/` (exported artefacts), `test-results/` (untracked), `freebuff-sites-build/` (untracked).
- Large files: `public/vault-frames` 9 MB, `public/keypad-frames` 5 MB, `public/wheel-turn` 4 MB, `public/vault-frames-sm` 4 MB — all tracked in git (checked via `git ls-files`; they are also copied into every `dist/`).

## 3. Environment variable names (names only; no values read or printed)

### Express (`grep -rhoE 'process\.env\.[A-Z0-9_]+' backend/src`)

| Name | Read at | In an `.env.example`? | Required in production |
|---|---|---|---|
| `DATABASE_URL` | `backend/src/money/schema.ts:83` | no | yes for the DDL; absent ⇒ in-memory store |
| `SUPABASE_URL` | `backend/src/shared/supabaseClient.ts` | no | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/src/shared/supabaseClient.ts`, `auth.service.ts` | no | yes (admin user create/delete) |
| `SUPABASE_PUBLISHABLE_KEY` | `backend/src/shared/supabaseClient.ts` | no | no |
| `SUPABASE_STORAGE_BUCKET` | `backend/src/vaults/download.routes.ts:17` | no | no (default `vault-files`; Fly sets `vault-deliverables`) |
| `JWT_SECRET` | `backend/src/shared/config.ts:10` | no | **yes** — a hard-coded fallback literal exists in the repo |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | `config.ts:11-12` | no | no |
| `SESSION_TTL_SECONDS` | `config.ts:16` | no | no |
| `PAYPAL_ENV` | `backend/src/shared/paypal.env.ts:15` | no | advisory only |
| `PAYPAL_BASE_URL` | `paypal.env.ts:28` | no | ignored (endpoint pinned to sandbox) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | `backend/src/paypal/paypal.client.ts` | no | yes for payment |
| `PAYPAL_WEBHOOK_ID` | `backend/src/paypal/webhook.routes.ts:37` | no | yes for webhook (fails closed) |
| `FRONTEND_URL`, `FRONTEND_ORIGINS` | `backend/src/app.ts:32` | no | yes for CORS/redirects |
| `AI_SERVICE_URL` | `backend/src/ai/ai.client.ts:13` | no | no (only the diagnostic route uses it) |
| `INTERNAL_API_KEY` | not read by Express; read by the Python engine | no (Express) | — |
| `NODE_ENV`, `PORT`, `APP_VERSION` | `app.ts`, `index.ts` | no | no |
| `MAX_FILE_SIZE_BYTES`, `UPLOAD_DIR` | `config.ts:24,41` | no | no |
| `USE_IN_MEMORY_DB`, `DEMO_MODE`, `VITE_DEMO_MODE` | `paypal.env.ts:23`, `config.ts:44` | no | no |
| `DEBUG` | `backend/src/shared/logger.ts` | no | no |

### Frontend (`grep -rhoE 'import\.meta\.env\.[A-Z0-9_]+' src`)

| Name | Read at | In an `.env.example`? | Required |
|---|---|---|---|
| `VITE_API_URL` | `src/lib/apiClient.ts:10` | no | yes at build time for the deployed SPA (falls back to same-origin `/api`) |
| `VITE_DEMO_MODE` | `src/lib/apiClient.ts:38` | no | no |
| `VITE_PAYPAL_CLIENT_ID` | `src/components/vault/PayPalAuthorizeButton.tsx` | no | yes for the PayPal buttons |
| `VITE_USE_REAL_API` | read as a string in `src/config/fx.ts:88` (`envFlag`) | no | no (each group defaults `true` anyway) |
| `DEV`, `PROD` | `src/config/env.ts`, `DevPanel.tsx` | n/a | Vite built-ins |

### Python engine (`vaultpay_m3_ai_engine/app/core/config.py:16-56`, plus `os.getenv` in `app/core/security.py:20`)

`APP_ENV`, `SECRET_KEY`, `ALLOWED_ORIGINS`, `DATABASE_URL`, `DATABASE_SYNC_URL`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_INDEX_CHUNKS`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS`, `PAYPAL_MODE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `REDIS_URL`, `MAX_UPLOAD_SIZE_MB`, `MAX_ZIP_EXPANDED_MB`, `MAX_ZIP_ENTRY_COUNT`, `MAX_ZIP_NESTING_DEPTH`, `UPLOAD_DIR`, `TEMP_EXTRACT_DIR`, `PROMPT_VERSION`, `EXTRACTOR_VERSION`, `INTERNAL_API_KEY`.

Mismatches:

- Only `vaultpay_m3_ai_engine/.env.example` exists. There is **no** `.env.example` at the repo root or in `backend/`, so 27 Express names and 4 frontend names are undocumented.
- `INTERNAL_API_KEY` is required by the engine (`security.py:20`, returns 503 without it) but is missing from its own `.env.example`.
- `backend/.env` exists locally and is untracked (`git ls-files` shows no `.env`); `.gitignore` covers `.env` and `.env.*`.
- `backend/fly.toml` sets `AI_SERVICE_URL` pointing at `vaultlance-ai-engine.internal:8000`, an app that does not exist (see `03-live.md`).

## 4. Deployment

| Service | Config | Region | Runtime | Health | Public URL (from config) |
|---|---|---|---|---|---|
| Express API | `backend/fly.toml`, `backend/Dockerfile` | `primary_region = "fra"` (live machine is in **cdg**) | `node:22-slim`, two-stage, runs as `node` (non-root), `npm ci --omit=dev`, `tsx src/index.ts` | `GET /health` every 15 s, grace 30 s | `https://vaultlance-ai.fly.dev` (`PUBLIC_API_URL`) |
| AI engine | `vaultpay_m3_ai_engine/fly.toml`, `Dockerfile` | `fra` | `python:3.11-slim`, non-root `appuser`, uvicorn | `GET /health` | `vaultlance-ai-engine.fly.dev` / `vaultlance-ai-engine.internal:8000` — **app does not exist on Fly** |
| Frontend | `vercel.json` | Vercel edge | Vite static build, SPA rewrite to `index.html` | n/a | `https://vault-lance-ai.vercel.app` (`FRONTEND_URL`) |
| Legacy | `render.yaml` | Render | Render blueprint for the same Express app | `/health` | not used (Fly is live) |

Docker quality: both images are multi-stage, non-root, install by lockfile, and copy no `.env` (`backend/.dockerignore` excludes `.env*`, `storage`, `tests`, `.git`). The Express image ships the whole `backend/` source (needed, because it runs `tsx`). No secret is baked in.

`flyctl status -a vaultlance-ai` (read-only, 2026-11-06T07:24Z):

```
app     │ 801e97f61edd48 │ 43 │ cdg │ started │ 1 total, 1 passing
Image   │ vaultlance-ai:deployment-307a0489b355cdc3544f58d7909a6453
```

`flyctl apps list` shows only `vaultlance-ai`. `flyctl status -a vaultlance-ai-engine` → `Could not find App "vaultlance-ai-engine"`; DNS for `vaultlance-ai-engine.fly.dev` → NXDOMAIN.

## 5. Checks run in this session

| Command | Where | Result |
|---|---|---|
| `npx tsc --noEmit` | root | exit 0, no output |
| `npx vitest run` | root | **11 files, 65 tests, all passed** (2.43 s) |
| `npx tsc --noEmit` | `backend/` | exit 0, no output |
| `npx vitest run` | `backend/` | **12 files, 50 tests, all passed** (45.35 s) |
| `npx playwright test --reporter=line` | root | **not completed inside the tool limit** (295 s cap). First background run reached 74/142 with failures; full result recorded in `03-live.md` §6 once the log finished. |
| `du -sm dist` | root | 24 MB; largest assets `index.esm-*.js`, `index-*.js`, then font subsets |

Nothing in this audit installed packages: `node_modules` and `backend/node_modules` were already present, so `npm ci` was not run. The Python engine was not executed: it needs `pip install -r requirements.txt` and several credentials, so its tests are UNVERIFIED.

## 6. Secrets scan (names only)

Working-tree scans (`grep -rlE` for key shapes; `-l` prints file names only) and `git log --all -S` for known key prefixes:

- No AWS access-key ids, Stripe live or project key prefixes, GitHub or Slack token prefixes, or PEM private-key blocks anywhere in the working tree.
- History searches for the AWS key prefix, the Stripe live-key prefix and both PEM private-key headers → **no commits**.
- `git log --all -S'SUPABASE_SERVICE_ROLE_KEY='` → 3 commits (`4a8dfc0`, `9b479c6`, `1a17817`). These are documentation/blueprint commits that name the variable (e.g. `render.yaml` with `sync: false`), not values; no credential-shaped string was found. No rotation needed on the evidence available.
- Files that mention secret *names* only: `backend/.dockerignore`, `backend/.gitignore`, `docs/deploy-fly.md`, `docs/deploy-real-accounts.md`, `postman/environments/*.yaml` (keys `client_id`, `client_secret`, `access_token` — values not printed; treat the exported Postman environment as sensitive and keep it out of public builds).
- `.tmp/ctx-secrets.mjs` exists untracked; it references no `process.env` names and no key-shaped strings (`grep -oE` returned nothing). Its content was not inspected further because it may hold credentials; treat as sensitive local scratch.

**Finding that matters more than a leaked file:** `JWT_SECRET` is not in the Fly secret list (see `03-live.md` §1), and `backend/src/shared/config.ts:10` falls back to a literal key committed to the repo. That is a forged-token risk, not a leaked-value risk. It is recorded as gap **B1**.

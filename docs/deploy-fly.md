# Deploying Phase 1 to Fly.io

Two apps, both in `fra`:
`vaultlance-ai` (Express API, public, port 8080) and
`vaultlance-ai-engine` (FastAPI engine, private via 6PN, port 8000).

Run every command from a checkout of `feat/phase1-money-loop` after merging to
`main`. Replace every `<...>` placeholder; never paste a value into this file.

## 0. Prerequisites

```bash
fly auth whoami                 # must be logged in as the org owner
fly apps list | grep -E 'vaultlance-(ai|ai-engine)'
```

`vaultlance-ai-engine` is new; `vaultlance-ai` is the existing live app (kept so
the deployed frontend's `VITE_API_URL` does not break).

## 1. Create the AI app

```bash
cd vaultpay_m3_ai_engine
fly apps create vaultlance-ai-engine --org personal
```

## 2. Secrets (values are never in git, fly.toml or this doc)

API app, from `backend/`:

```bash
fly secrets set --app vaultlance-ai \
  PAYPAL_CLIENT_ID='<paypal sandbox client id>' \
  PAYPAL_CLIENT_SECRET='<paypal sandbox client secret>' \
  PAYPAL_WEBHOOK_ID='<webhook id from step 5>' \
  SUPABASE_URL='<project url>' \
  SUPABASE_SERVICE_ROLE_KEY='<service role key>' \
  DATABASE_URL='<postgres connection string, needed for the money-loop DDL>' \
  JWT_SECRET='<32+ random chars>' \
  INTERNAL_API_KEY='<random string shared with the engine>'
```

AI app, from `vaultpay_m3_ai_engine/`:

```bash
fly secrets set --app vaultlance-ai-engine \
  INTERNAL_API_KEY='<the same random string>' \
  ANTHROPIC_API_KEY='<anthropic key>' \
  DATABASE_URL='<ai database url>' \
  PAYPAL_CLIENT_ID='<paypal sandbox client id>' \
  PAYPAL_CLIENT_SECRET='<paypal sandbox client secret>' \
  SECRET_KEY='<random string>'
```

`PAYPAL_ENV=sandbox` is a plain var in `fly.toml`; the API refuses to boot if it
is anything else.

Deliverables live in a **private** Supabase Storage bucket, and uploads go
there whenever Supabase is configured, because the paid-download route signs an
object in that bucket and the container's disk does not survive a redeploy.
This project's `fly.toml` points `SUPABASE_STORAGE_BUCKET` at
`vault-deliverables`; without a private bucket by that name (or the default
`vault-files`), uploads fail with `STORAGE_WRITE_FAILED` and paid downloads
with `SIGNING_FAILED`. The bucket must stay private — downloads are served as
60-second signed URLs.

## 3. Deploy

```bash
cd backend && fly deploy --app vaultlance-ai
cd ../vaultpay_m3_ai_engine && fly deploy --app vaultlance-ai-engine
```

The API runs its idempotent money-loop DDL at boot (`src/money/schema.ts`); no
release command is needed.

## 4. Verify

```bash
fly status  --app vaultlance-ai
fly status  --app vaultlance-ai-engine
curl -s https://vaultlance-ai.fly.dev/health
curl -s https://vaultlance-ai-engine.fly.dev/health
# must be 403: the engine is not usable without the key
curl -s -o /dev/null -w '%{http_code}\n' https://vaultlance-ai-engine.fly.dev/projects
# must be 200 from inside the API only
# (authenticated) GET https://vaultlance-ai.fly.dev/api/ai/health
```

## 5. Register the webhook in PayPal (sandbox)

URL: `https://vaultlance-ai.fly.dev/api/webhooks/paypal`

Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`,
`PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`,
`PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`,
`PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`,
`PAYMENT.PAYOUTS-ITEM.BLOCKED`, `PAYMENT.PAYOUTS-ITEM.RETURNED`.

Copy the generated Webhook ID into `PAYPAL_WEBHOOK_ID` (step 2) and redeploy —
until it is set the route rejects every delivery on purpose.

## 6. Rollback

```bash
fly releases --app vaultlance-ai            # find the previous version
fly deploy --app vaultlance-ai --image registry.fly.io/vaultlance-ai:deployment-<previous>
fly releases --app vaultlance-ai-engine
fly deploy --app vaultlance-ai-engine --image registry.fly.io/vaultlance-ai-engine:deployment-<previous>
```

Code rollback: `git reset --hard phase1-pre` (tag `bcc9856`).

## 7. Cost (estimate — verify against current Fly pricing)

- API: `shared-cpu-1x`, 512 MB, `min_machines_running = 1` — always on while the
  demo runs.
- Engine: `shared-cpu-1x`, 1 GB, `min_machines_running = 1` — always on.
- Both stop to zero (`auto_stop_machines = "stop"`) once `min_machines_running`
  is set back to `0` after the demo window.

Fly's free allowance has changed more than once; treat any figure as an estimate
and check the current pricing page before relying on it.

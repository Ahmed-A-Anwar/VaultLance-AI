# Deploying secrets

This API refuses to start in production unless `JWT_SECRET` is at least 32
characters. There is no fallback value in the code: a fallback is a secret that
anyone who can read this repository also knows, and a token signed with the old
one was accepted by the deployed API before batch 1.

## Generate a secret

```bash
openssl rand -base64 48
```

Anything with 32+ random characters works. Do not reuse a password, a JWT from
another service, or a value from a screenshot.

## Set it on Fly

```bash
fly secrets set JWT_SECRET="<paste the generated value>" -a vaultlance-ai
```

Notes:

- Setting a secret **restarts the machine**, so the API is briefly unavailable.
- Every existing session is signed with the old secret and becomes invalid:
  **every signed-in user is signed out** and has to log in again. That is the
  point of rotating it after a leak.
- The value never goes in the repository, a shell history file, or chat. Fly
  stores it encrypted and injects it as an environment variable.
- Verify the name is present without reading values:

```bash
fly secrets list -a vaultlance-ai
```

## Secrets that must exist (names only)

| Name | Required for |
| --- | --- |
| `JWT_SECRET` | signing sessions — **required in production** |
| `SUPABASE_URL` | database and storage |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side database writes |
| `SUPABASE_ANON_KEY` | Supabase client construction |
| `PAYPAL_CLIENT_ID` | PayPal OAuth |
| `PAYPAL_CLIENT_SECRET` | PayPal OAuth |
| `PAYPAL_WEBHOOK_ID` | webhook signature verification (unset = every webhook is rejected) |
| `PAYPAL_ENV` | must stay `sandbox` in this build |
| `DATABASE_URL` / `DIRECT_URL` | schema bootstrap and the money tables |
| `ELASTICSEARCH_URL` / `ELASTICSEARCH_API_KEY` | the optional AI engine |
| `INTERNAL_API_KEY` | Express → AI engine calls |

Optional: `JWT_ISSUER` and `JWT_AUDIENCE`. When set, tokens are verified against
them; when unset, those checks are skipped rather than defaulted.

## Local development

A missing `JWT_SECRET` outside production is replaced by a random per-process
value and a warning that names the variable. Sessions created in that process
stop working when it restarts, which is expected: the alternative was a shared
literal that worked everywhere, including in production.

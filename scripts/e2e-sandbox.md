# Sandbox end-to-end proof — steps

Run against the deployed URLs only. Two PayPal **Personal sandbox** accounts are
needed: one freelancer, one client. Secrets come from the environment; nothing
here is printed by the checker.

```bash
export API_URL=https://vaultlance-ai.fly.dev/api
export E2E_FREELANCER_EMAIL=...   E2E_FREELANCER_PASSWORD=...
export E2E_CLIENT_EMAIL=...       E2E_CLIENT_PASSWORD=...
node scripts/e2e-check.mjs
```

The checker automates steps 1, 2 (create/upload/submit/invite), 3 (join),
5 (guards), 7, 8c/8d/8e/8f. The PayPal-hosted approval and the payout arrival
need a human and are marked **manual**.

| # | Step | How | Auto? |
|---|---|---|---|
| 1 | Register freelancer + client | `POST /api/auth/register` for both roles | auto |
| 2 | Freelancer creates vault, uploads a small zip, submits, invites | `POST /api/vaults`, `POST /api/uploads/:id`, `POST /api/vaults/:id/submit` → `manifestSha256`, `POST /api/vaults/:id/invite-code` → `VL-XXXX-XXXX` | auto |
| 3 | Client joins with the code | `POST /api/vaults/:id/join { code }`; a wrong code is `404` | auto |
| 4 | Client authorizes payment in PayPal | `POST /api/vaults/:id/payment/order`, open `links[].href` where `rel=payer-action`, log in as the **client** sandbox account, approve; the return URL lands on the vault. Then `POST /api/vaults/:id/payment/authorize { orderId }` → `AUTHORIZED` | **manual** (approval page) + auto call |
| 5 | Audit complete | real verification if the engine is wired (`GET /api/ai/health` proves reachability), otherwise `POST /api/vaults/:id/checks/run` (labelled temporary) | auto |
| 6 | Client approves → capture → unlock | `POST /api/vaults/:id/approve`; expect `status: PAID`, then `GET /api/vaults/:id/files/:fileId/download` returns a 60s URL | auto |
| 7 | Payout | freighter balance in the freelancer sandbox account shows one payout; record capture id, `sender_batch_id` (`vl-<vaultId>`), and the three fee lines from `vault_captures` | **manual** (PayPal balance) |
| 8 | Second vault: authorize then reject | `POST /:id/void` → `CANCELLED`, files stay locked, download `403` | auto |
| 9 | Failures | (a) replay a stored event → no double payout; (b) webhook unregistered → sweeper unlocks within 60s; (c) invalid signature → `400`; (d) wrong user approve → `403`; (e) wrong state approve → `409`; (f) `amount` in the body is ignored | auto except (b) needed a real capture |

Record results with timestamps and ids in the table produced by the checker; do
not mark a row passed unless the checker or PayPal itself showed it.

# Laws audit — baseline

Date: 2026-11-09  
Branch: `chore/laws`, from `main` at `d331e88`  
Scope: the top screens in `REPORT.md`; no money, state-machine, auth, or security-rule changes.

## Deployed surfaces

| Surface | URL | Region | Observed |
|---|---|---|---|
| Frontend | `https://vault-lance-ai.vercel.app` | Vercel edge `fra1` (Frankfurt) | `x-vercel-id: fra1::…`; HTML was a cache `HIT` during the RTT sample |
| API | `https://vaultlance-ai.fly.dev` | Fly machine in `cdg` (Paris) | `fly-request-id` ended `-cdg`; machine `875e99b0e0d2d8`, v102, 1/1 checks passing |
| Supabase | Not exposed by the app | EU per deploy notes; exact region unavailable | API health is green, but the project host is a Fly secret and no database RTT was measured |

The API is in `cdg`, while `backend/fly.toml` declares `primary_region = "fra"`. That is a live configuration discrepancy; it was recorded and not changed because deployment configuration was outside this pass.

## Round-trip samples from this machine

Five sequential requests, no cache busting:

| Target | Samples | Median |
|---|---|---|
| Frontend HTML | 0.963, 0.987, 1.015, 1.158, 1.976 s | **1.015 s** |
| API `/health` | 0.829, 0.837, 0.851, 4.964, 8.128 s | **0.851 s** warm; the two slow samples were cold/reconnect outliers |

## Lighthouse — deployed baseline (pre-branch code)

| Category | Mobile | Desktop |
|---|---:|---:|
| Performance | **48** | **56** |
| Accessibility | 100 | 100 |
| Best practices | 100 | 100 |
| SEO | 91 | 91 |

| Metric | Mobile | Desktop |
|---|---:|---:|
| FCP | 3.75 s | — |
| LCP | **6.67 s** | **6.30 s** |
| TBT | 550 ms | 0 ms |
| CLS | 0.001 | 0 |
| Speed Index | 8.0 s | — |
| Total transferred | 2,129 KiB | 2,129 KiB |

The LCP node was `p.hero-body`. The deployed LCP was dominated by server/network delay plus the entrance gate and the body's opacity animation, not by a late image.

Other measured costs:

- Unused JavaScript: **101 KiB** estimated savings (`index-CgqWj1kz.js` 76 KiB, `api-BoTDa05e.js` 27 KiB).
- Unused CSS: 11 KiB.
- Initial JavaScript: 150.7 KiB gzip (`index-DbbVB3Hr.js` after the fix; same code family as baseline).
- GSAP bundle: 325.9 KiB gzip in a separate `index.esm` chunk.
- API warm `/health` is ~0.85 s, so every request that waits for it before showing state spends most of a one-second budget.

## Lighthouse — local post-fix, for diagnosis only

This is the current branch served by `vite preview` on loopback, not a production deployment. It is **not** a controlled before/after against the deployed numbers.

| Category | Mobile | Desktop |
|---|---:|---:|
| Performance | **71** | **97** |
| Accessibility | 100 | 100 |
| Best practices | 100 | 100 |
| SEO | 91 | 91 |

| Metric | Mobile | Desktop |
|---|---:|---:|
| FCP | 0.8 s | 0.2 s |
| LCP | **4.4 s** | **1.0 s** |
| TBT | 490 ms | 10 ms |
| CLS | 0.001 | 0 |

Mobile remains over the 2.5 s LCP budget. Desktop is inside it. The remaining mobile gap is the first-run boot gate, the large synchronous JavaScript payload, and the display font arriving late; it is not the hero image.

## Screen inventory used for the audit

| Screen | States | 390 | 1440 | Source |
|---|---|---|---|---|
| Landing | intro, settled, reduced motion | yes | yes | browser |
| Sign up | role choice, account, verify, ready | yes | yes | browser |
| Sign in | idle, checking, rejected, accepted | yes | yes | browser |
| Playground | empty, funded, audited, captured | yes | yes | browser |
| Audit room | awaiting payment, held, audited, unlocked, voided | yes | yes | existing room matrix; prior Playwright pass |
| Client overview | client role | yes | yes | browser |
| Freelancer overview | freelancer role | yes | yes | browser |
| New-vault drawer | freelancer | yes | yes | browser |
| Payments | client holds/receipts; freelancer payouts | yes | yes | browser |
| Receipt | generated document | yes | yes | existing payments flow |

“Pending” is not an audit-room state. It is a payment/payout state; the room uses `unlocked` for the state the UI calls PAID.

## Known gaps in this baseline

- Supabase region and database RTT are unresolved because the project host is a Fly secret.
- The deployed frontend is older than this branch; local post-fix numbers are not production verification.
- Mobile LCP/TBT still fail the budget.
- APIMatic is absent from `main`; this branch deliberately does not invent it.

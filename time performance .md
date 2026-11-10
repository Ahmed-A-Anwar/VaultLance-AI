# Time performance

Report date: **2026-11-10**
Production frontend: `https://vault-lance-ai.vercel.app`
Production API: `https://vaultlance-ai-1.onrender.com/api` (API revision at measurement: `14fdf70`; frontend entry at measurement: `index-BI5gNv2K.js`)
Report scope: sign in, sign up, dashboard, vaults, payments, ledger, settings and the audit room.

> **Measurement honesty:** these are production measurements from one machine, not a controlled laboratory experiment. The post-deploy sample ran at a time when the API's network latency was higher than during the pre-deploy sample. The report keeps the earlier numbers for context, but it does not attribute every page-level difference to the code changes.

## How the numbers were produced

| Measurement | Definition |
|---|---|
| **Direct load** | A fresh Chromium context restores the existing account session and loads the URL from the production edge. Time is navigation start until the page-specific content is visible. |
| **In-app route** | The same signed-in dashboard tab navigates through its rail. Time is the click until the destination content is visible; JavaScript and CSS are already warm. |
| **Sign-in transition** | A fresh `/signin` page submits the existing account's credentials. Three separate timestamps are recorded: submit → `/dashboard` URL, URL → dashboard shell, and URL → all 16 vault cards. |
| **Production sample** | Three runs per page and three runs per dashboard route, measured on 2026-11-10 at **22:41 UTC**. The table reports the median and the min–max range. |
| **Cache probe** | Two API reads for the same user separated by 800 ms. The first query fills the 2-second per-user cache; the second should report the cache path in `Server-Timing`. |
| **Viewport** | 1440 × 1000, Chromium headless, no Lighthouse CPU/network throttling. |

The sweep was read-only against vault content: it used the existing 16-vault client account, opened one existing PAID vault for the audit room, and created no vaults, files, payments or ledger rows. The three sign-in runs created ordinary authentication sessions. Auth tokens and vault ids are not printed in this report.

## Executive result

| Page | Starting point | What changed | Post-deploy result | Direction |
|---|---|---|---|---|
| **Sign in** | 3.29 s sign-in → dashboard in the UX audit; production reproduction left the sign-in card on screen for about 12 s after the URL became `/dashboard` | Dashboard shell and Overview are preloaded from `/signin`, awaited before navigation; the dashboard owns an inner Suspense boundary; the freelancer surface is lazy | Direct page load **1,867 ms**; submit → URL **5,293 ms**; URL → shell **56 ms** (45–88 ms); URL → form gone **61 ms** (48–92 ms); URL → 16 cards **2,961 ms** | **Stale post-login screen removed in production.** The form clears within 92 ms of the URL change. |
| **Sign up** | Card visible in **1.01 s**; warm registration **1.63 s**, success card **3.07 s**; cold-first signup **10.1 s** click-to-answer | Auth timeout raised from 10 s to 45 s so a cold API does not report failure after creating the account | Direct page load **1,622 ms** (1,574–2,260 ms) | Reliability fix; no page-speed improvement claimed. |
| **Dashboard** | Earliest authenticated 16-vault load **3,717 ms**; pre-deploy production sweep **2,867 ms** | Auth/session/profile parallelized; vault memberships, owned vaults, members, files and ledger reads collapsed into one direct query; captures moved into the parallel phase; pool warmed; signed-token read started beside `requireAuth`; 2 s vault-list cache deployed | Direct **4,264 ms** (4,163–6,339 ms); warm in-app **445 ms** (413–475 ms); vault-list server read **361 ms** | Page timing was higher in this sample; no code-speed improvement or regression is claimed. The server read itself stayed near **361 ms**. |
| **Vaults** | **4,330 ms** in the earlier 16-vault production check; pre-deploy production sweep **2,254 ms** | Same query-path work as Dashboard, plus the deployed 2 s per-user cache | Direct **4,228 ms** (4,195–4,470 ms); warm in-app **488 ms** (456–591 ms); cache read **190 ms** vs direct **360 ms** | Cache path confirmed. Page-level comparison is network-bound; no causal improvement claim. |
| **Payments** | No earlier page timing recorded; pre-deploy production sweep **2,728 ms** | No dedicated Payments route optimization; it uses the shared dashboard shell | Direct **7,841 ms** (7,571–13,144 ms); warm in-app **4,551 ms** (4,315–5,124 ms) | No before/after claim. This page was API/network-dominated in the sample. |
| **Ledger** | A concurrent production read started **1 ms** after `/vaults` and overlapped it for **2,522 ms**; pre-deploy **4,299 ms** direct / **1,483 ms** warm | No dedicated Ledger route optimization | Direct **3,303 ms** (3,203–3,504 ms); warm in-app **306 ms** (300–592 ms) | Warm result improved in this sample; no standalone causal claim. |
| **Settings** | No earlier page timing recorded; pre-deploy **4,609 ms** direct / **2,171 ms** warm | No dedicated Settings route optimization; it benefits only from the shared shell | Direct **3,228 ms** (3,222–3,744 ms); warm in-app **1,447 ms** (1,414–1,975 ms) | No causal before/after claim. |
| **Audit room** | No earlier page timing recorded; pre-deploy **5,493 ms** | No dedicated audit-room performance work | Direct **4,717 ms** (4,710–4,717 ms) for the existing PAID vault | No before/after claim. |
| **Landing — reference** | Mobile LCP **6.67 s**, performance score **48**; desktop LCP **6.30 s**, score **56** | Static/prerendered mobile hero copy, static text paint, capped font gate, phone gate skip, font swap, deferred clip work, lazy button controller | Previously recorded live mobile LCP **972 ms**, score **84**; local desktop LCP **887 ms**, score **98** | **−5.70 s / −85.4%** mobile LCP; not rerun in this sweep. |

## Page details

### Sign in

**Starting state**

- UX audit (`docs/ux-audit/REPORT.md`, 2026-11-07): sign-in → dashboard took **3.29 s**; the raw flow evidence records **2,941 ms**.
- Production reproduction (2026-11-10): URL changed to `/dashboard`, but the sign-in card remained for about **12 s**. The login request itself took about **17.7 s**, so a reload was the only way to reach the rendered dashboard.

**What changed**

- `src/pages/dashboard/preload.ts` warms the lazy dashboard shell and the role's Overview chunk while the user is on `/signin`.
- `src/pages/Signin.tsx` starts the prefetch after the form entrance and awaits it before `navigate("/dashboard")`.
- `src/pages/dashboard/DashboardLayout.tsx` has an inner Suspense boundary around the dashboard area, so a lazy area cannot hold the previous sign-in page under the new URL.
- The freelancer surface is lazy, so a client does not download that surface before the client dashboard can render.

**Result**

- Direct `/signin` load: **1,867 ms** median (1,621–2,068 ms).
- Three real production sign-ins:
  - Submit → `/dashboard` URL: **5,293 ms** median (5,200–5,972 ms). This includes the login request.
  - URL → dashboard shell: **56 ms** median (45–88 ms).
  - URL → sign-in form gone: **61 ms** median (48–92 ms).
  - URL → all 16 vault cards: **2,961 ms** median (2,382–3,507 ms).
- At the first check immediately after the URL changed, the old form was still in the DOM; it cleared **48–92 ms** later. That is a single render frame, not the previous multi-second stale screen.
- 16 vault cards rendered in all three runs; no page errors.

### Sign up

**Starting state**

- Signup card visible in **1.01 s** in the UX audit.
- Warm registration: **201 in 1.63 s**; success card at **3.07 s** (`docs/e2e/RESULTS.md`).
- Cold-first signup: **10.1 s** click-to-answer, **15.4 s** including page load.

**What changed**

- The auth request deadline was raised from the general **10 s** to **45 s**. The earlier deadline could show “The server took too long to answer” after the account had already been created.
- This is a reliability improvement, not a page-load optimization.

**Result**

- Direct `/signup` load: **1,622 ms** median (1,574–2,260 ms).
- No account was created during the sweep. Cold API startup still dominates submission time; the 45 s deadline lets a successful response arrive.

### Dashboard

**Starting state**

- The authenticated 16-vault dashboard first rendered at **3,717 ms**; the warm run was **4,031 ms**.
- The pre-deploy production sweep recorded **2,867 ms** direct and **187 ms** warm.
- The backend path originally waited for authentication, then made separate reads for memberships, owned vaults and captures before the dashboard could draw the list.

**What changed**

- Session validation and profile lookup run in parallel.
- The vault list uses one direct SQL query when `DATABASE_URL` is available, with PostgREST retained as fallback.
- Captures moved into the parallel read phase.
- The connection pool is warmed, and the signed-token vault read starts alongside `requireAuth`.
- `Server-Timing` exposes the vault-list duration and whether the fallback path was used.
- The 2-second per-user vault-list cache is deployed and invalidated by vault, money, upload, invite, audit and PayPal writes.

**Result**

- Direct production load: **4,264 ms** median (4,163–6,339 ms).
- Warm in-app dashboard transition: **445 ms** median (413–475 ms).
- Vault-list server timing in this sample: **361 ms**.
- The page-level result is higher than the pre-deploy **2,867 ms**, while the server-side vault read stayed in the same range. This sample's network/API overhead moved the total; the difference is not attributed to the cache.

### Vaults

**Starting state**

- `/dashboard/vaults` took **4,330 ms** in the earlier production check with the same 16-vault account.
- The pre-deploy production sweep recorded **2,254 ms** direct and **353 ms** warm.

**What changed**

- Same query-path work as Dashboard: parallel auth, one direct vault-list query, parallel captures, warm pool.
- A **2-second per-user cache** now serves a repeated list read. Any vault, member, file, ledger, invite, upload, audit or PayPal write clears the user's entry and advances the cache generation.

**Result**

- Direct production load: **4,228 ms** median (4,195–4,470 ms).
- Warm in-app transition: **488 ms** median (456–591 ms).
- Delayed API probe: the first read took **360 ms** on the `direct` path; the second read took **190 ms** on the `cache` path.
- Three page-sample reads hit the cache at **175–195 ms**, beside `direct` timings of **360–362 ms**; the delayed probe added a fourth cache read at **190 ms**.
- The page-level direct result was higher than the pre-deploy sample. With a 2-second TTL and a multi-second API round trip, a direct page load separated from the previous read does not usually hit the cache, so no page-level speedup is claimed.

### Payments

**Starting state**

- No earlier page timing was recorded for the client Payments route; the pre-deploy sweep recorded **2,728 ms** direct and **405 ms** warm.

**What changed**

- No dedicated Payments performance change in this pass. It uses the shared dashboard shell and its own existing data reads.

**Result**

- Direct production load: **7,841 ms** median (7,571–13,144 ms).
- Warm in-app transition: **4,551 ms** median (4,315–5,124 ms).
- The page was API/network-dominated during this sample, including one 13.1 s cold/outlier run. No percentage change is claimed.

### Ledger

**Starting state**

- The earlier concurrent check recorded `/ledger` starting **1 ms after `/vaults`**, overlapping it for **2,522 ms**.
- The pre-deploy sweep recorded **4,299 ms** direct and **1,483 ms** warm.

**What changed**

- No dedicated Ledger route optimization in this pass. The ledger still reads through the existing data provider and grid.
- The dashboard's lazy shell and shared data provider are the only relevant shared changes.

**Result**

- Direct production load: **3,303 ms** median (3,203–3,504 ms).
- Warm in-app transition: **306 ms** median (300–592 ms).
- The warm result improved in this sample, but no standalone causal before/after claim is made.

### Settings

**Starting state**

- No earlier page timing was recorded; the pre-deploy sweep recorded **4,609 ms** direct and **2,171 ms** warm.

**What changed**

- No dedicated Settings performance change in this pass. It uses the shared dashboard shell and retains its own data read, entrance motion and section rendering.

**Result**

- Direct production load: **3,228 ms** median (3,222–3,744 ms).
- Warm in-app transition: **1,447 ms** median (1,414–1,975 ms).
- No causal before/after percentage is claimed.

### Audit room

**Starting state**

- No earlier page timing was recorded. The pre-deploy sweep recorded **5,493 ms**.
- The measured room is an existing PAID vault, so this is a normal unlocked-room load, not an awaiting-payment or error state.

**What changed**

- No dedicated audit-room performance work in this pass.

**Result**

- Direct production load: **4,717 ms** median (4,710–4,717 ms).
- The room opened successfully in all three samples; no page errors.

## Pre-deploy and post-deploy direct samples

These are the same pages and account, but the two samples ran under different network conditions. Read this as context, not as a controlled A/B result.

| Page | Pre-deploy (22:19 UTC) | Post-deploy (22:41 UTC) |
|---|---:|---:|
| Sign in | 1,685 ms | **1,867 ms** |
| Sign up | 1,868 ms | **1,622 ms** |
| Dashboard | 2,867 ms | **4,264 ms** |
| Vaults | 2,254 ms | **4,228 ms** |
| Payments | 2,728 ms | **7,841 ms** |
| Ledger | 4,299 ms | **3,303 ms** |
| Settings | 4,609 ms | **3,228 ms** |
| Audit room | 5,493 ms | **4,717 ms** |

The vault-list server work itself was **493 ms** in the earlier check and **361 ms** in this one. The larger page-level swings occurred in the network/API path around that server read; the vault query itself measured in the same range.

## Supporting measurements

### Landing Lighthouse history (reference only)

| Run | Performance | LCP | TBT | CLS |
|---|---:|---:|---:|---:|
| Deployed baseline, mobile | 48 | **6.67 s** | 550 ms | 0.001 |
| Deployed baseline, desktop | 56 | **6.30 s** | 0 ms | 0 |
| Local final, mobile | 85 | **753.5 ms** | 573 ms | 0 |
| Local final, desktop | 98 | **887.4 ms** | 9 ms | 0.00025 |
| Live production, mobile | 84 | **972 ms** | 568 ms | 0 |

The landing improvement is the strongest completed performance result, but its remaining TBT is still over the 200 ms budget. The main bundle remains about **150.9 KiB gzip** and still carries GSAP through the vault surface.

### Initial shell timings from the first production sweep

These are historical one-run values from before this deployment, shown only to separate shell delivery from page data readiness:

| Page | TTFB | DOMContentLoaded | FCP | Content ready |
|---|---:|---:|---:|---:|
| Sign in | 770 ms | 1,450 ms | 1,492 ms | 1,872 ms |
| Sign up | 681 ms | 1,331 ms | 1,368 ms | 2,221 ms |
| Dashboard | 704 ms | 1,365 ms | 1,400 ms | 2,251 ms |
| Vaults | 671 ms | 1,533 ms | 1,572 ms | 3,460 ms |
| Ledger | 686 ms | 1,360 ms | 1,412 ms | 5,638 ms |
| Payments | 667 ms | 1,334 ms | 1,372 ms | 2,741 ms |
| Settings | 668 ms | 1,310 ms | 1,356 ms | 5,106 ms |
| Audit room | 687 ms | 1,536 ms | 1,576 ms | 8,583 ms |

The first-run audit-room and ledger samples were cold/API outliers; the three-run medians in the main table are the numbers to use.

## Deployment and checks

- Backend cache: commit `32594aa` (`perf(vaults): cache the dashboard list for two seconds`).
- Sign-in transition: commit `14fdf70` (`fix(auth): render the dashboard after sign-in`).
- `main` was pushed; Render reports revision `14fdf70f11bc921c7b5e0130c2323ba394f44d2c` and `databaseHealthy: true`.
- Vercel production was serving `index-BI5gNv2K.js` when the sweep ran.
- Frontend: `npm run build` passed; `npm run test:unit` passed **14 files / 75 tests**.
- Backend: `npm run build` passed; `npm test` passed **27 files / 141 tests**, including the cache unit and API tests.
- The sweep recorded **0 page errors** across all direct, transition and warm runs.
- The temporary Playwright sweep was removed after the run; its results are summarized here.

## What was improved overall

1. **Sign-in handoff:** the dashboard shell is on screen **56 ms** after the URL changes, and the old form is gone within **92 ms**, replacing the previous multi-second stale sign-in screen.
2. **Vault-list cache:** deployed and verified. A cached read took **190 ms** server-side versus **360 ms** direct, and three page samples plus the delayed probe recorded cache reads at **175–195 ms**.
3. **Warm route transitions:** Overview **445 ms**, Vaults **488 ms**, Ledger **306 ms**, Settings **1,447 ms** in this sample.
4. **Release quality:** both production deployments are live; frontend build/tests and backend typecheck/tests pass.

## What is not improved or not measured

- **Payments** is the slowest page in this sample at **7.84 s** direct; it received no dedicated optimization and was API/network-dominated.
- **Dashboard, Vaults and Payments** measured slower than the pre-deploy sample while their vault-list server read stayed around **361 ms**. That is a network/API-path difference in this sample, not evidence that the cache made them slower.
- **Direct page loads** separated by more than the 2-second TTL do not hit the vault-list cache; the cache helps repeated reads inside that window, not a cold navigation.
- **Landing TBT** remains **568 ms live** (historical Lighthouse result), above the 200 ms budget. Lighthouse and mobile CLS were not rerun in this sweep.
- The UI audit still records **CLS up to 0.74 on the mobile overview** while data loads; that layout-shift issue is separate from these route timings.
- These timings use one machine and a warm production account; they are not a substitute for field monitoring.

## Evidence and commands

Historical sources:

- `docs/laws-audit/BASELINE.md` — deployed Lighthouse baseline.
- `docs/laws-audit/PERF.md` — landing LCP attempts and final live result.
- `docs/laws-audit/REPORT.md` — final Lighthouse and route checks.
- `docs/ux-audit/REPORT.md`, `docs/ux-audit/evidence/flows.json` — signup/signin UX timings.
- `docs/e2e/RESULTS.md` — warm and cold signup timings.
- `docs/ui-audit/REPORT.md` — mobile overview CLS and UI-audit limitations.

Post-deploy sweep:

- Date: 2026-11-10T22:41:07Z.
- Account: existing 16-vault client (4 PAID vaults).
- Audit-room sample: one existing PAID vault.
- Runs: three per page/route and three real sign-in transitions; medians and ranges above.
- Read-only against vault content; no records created or changed.

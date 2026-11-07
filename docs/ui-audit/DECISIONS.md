# UI audit decisions

Only defects are fixed. A change to a spec value is recorded here with before,
after and why. No redesign, no copy rewrites.

| # | Area | Before | After | Why |
|---|---|---|---|---|
| 1 | Fonts under test | Task names Fraunces / Inter / JetBrains Mono | Checks Archivo Variable + IBM Plex Mono, the two faces the app actually declares in `src/styles/tokens.css`, and still probes the three named faces | The app's type system is Archivo + IBM Plex Mono; flagging a face the app never uses would be a false positive. |
| 2 | `/terms`, `/privacy` | Listed as pages to audit | Marked N/A; the unknown-path 404 is audited instead | No such routes exist in `App.tsx`; creating them would be a new feature. |
| 3 | Firefox | Third engine | **Blocked**: binary not installed and the install question was skipped | Installing a browser binary was offered and not approved; chromium + webkit cover the matrix threshold in the meantime. |
| 4 | Stress data | Real vaults/ledger rows | Playwright route stubs answer `/api/**`; dashboard session is seeded in `sessionStorage`; all runs use `?demo=1` | Standing rule: never create real data for stress states. |
| 5 | Tap targets | One 44px rule for everything | Primary actions below 44px are P1; secondary controls are P2 | The brief asks for primary actions to be reported separately; WCAG 2.2's minimum is 24px, so a 34px secondary chip is not a P1. |
| 6 | Clipping | Any 1px overflow of `scrollHeight` | Ignore <3px width / <5px height and grid internals | Line-height rounding on a single line is not clipped text; the grid's cells clip by design. |
| 7 | Ellipsis | Any truncation is a defect | Elements may opt in with `data-ellipsis` | The brief allows intended ellipsis when marked; the sweep skips marked nodes. |

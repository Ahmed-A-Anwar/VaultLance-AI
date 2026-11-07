# UX decisions

Product choices are not made here. Each entry lists the options, the
recommendation, and what was done in the meantime (nothing, or a reversible
copy change already consistent with the recommendation).

## D1 — Canonical noun: vault or project

Occurrences in `src/`: **vault 1,200**, project 136.

- Options: (a) vault everywhere, (b) project everywhere, (c) vault for the escrow
  object and project for the work.
- Recommendation: **(a) vault** — it is the product's name for the sealed
  container and already dominates. "Project" should stay only where it means the
  client's job (for example the project name field).
- Done now: nothing; existing copy left as is.

## D2 — Role names

**Freelancer 592**, client 266.

- Recommendation: **Freelancer** and **Client**, capitalised when they name the
  role, lower-case in prose.
- Done now: nothing.

## D3 — Sign in vs Log in

**Sign in 24**, Log in 0.

- Recommendation: **Sign in** / **Sign out** everywhere.
- Done now: nothing; no "Log in" exists to change.

## D4 — Money words: authorize, capture, void, hold

Occurrences: void 466, authorize 239, hold 190, capture 170.

- Options: (a) keep the PayPal words, (b) plain English only, (c) plain English
  with the processor word in parentheses on first use.
- Recommendation: **(c)** — "Authorize payment" (the client reserves the
  amount), "Held" (the state), "Release payment" (the freelancer is paid),
  "Cancel and release the hold" (void). First use on the audit room and the
  payment card should gloss "authorize" as "reserve the amount on your card;
  you are charged only when you approve the work".
- Done now: nothing. This touches money-state copy across screens and needs
  your sign-off before the wording changes.

## D5 — Firefox

The browser binary is not installed and the install question was not approved.

- Recommendation: install it and add it to the flow runs; until then chromium is
  the only engine for these flows.

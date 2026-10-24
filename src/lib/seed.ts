import type { ManifestItem } from "./hash";

/*
  The seeded transaction. One vault, every surface reads it: landing sections
  stage exactly these events; /demo replays it; /console lists its ledger rows.
  Illustrative data (see RESEARCH.md — PostHog honesty rule), EXCEPT the sandbox
  txn id + timestamps below, which are real values generated for THIS build.
*/
export const SANDBOX_TXN = {
  authId: "8Y2M18A5BV777014U",        // sandbox authorization reference — real id, this build
  captureId: "9CR612XW953022H3",      // sandbox capture reference — real id, this build
  createdAt: "2026-10-23T09:14:52Z",   // real timestamp of this sandbox replay
};

export interface VaultFile extends ManifestItem { }

export const SEED = {
  vault: {
    id: "vp_8f3kq2nx4t",
    token: "cx7-29kd-wq1m",           // the /v/[token] portal token
    title: "Onboarding portal redesign — 6 screens + tokens",
    amountCents: 425000,              // $4,250.00 held, not captured
    currency: "USD" as const,
    createdAt: SANDBOX_TXN.createdAt,
    stagingUrl: "https://vaultpay-sandbox-preview.app/checkout",
    files: [
      { path: "src/checkout/index.tsx", size: 51200, hash: "3f9ac1b7d402e6f88ab71c1cb41c0d12e6d2e04db83e21b0a3003a1f36a23e4d" },
      { path: "src/steps/AddressStep.tsx", size: 18944, hash: "94f0ac31d0e2f4b7a8029c1ae0b741d0dbe82130030a1e4a36b23c7d01e88f52" },
      { path: "src/steps/PaymentStep.tsx", size: 64768, hash: "dead718210b3f4c6a9028b1ded030e4a36b23c7d01e88f52ac120ef18b3c7011" },
      { path: "styles/tokens.css", size: 8192, hash: "c608f4ec1b703291dae0d580a147e1d30ef82ee9f4d28ab75ed3a2c1de8029e4" },
      { path: "tests/checkout.spec.ts", size: 12720, hash: "8d1f30a24c69b1e0fd645ec2712f39b6a8c1d030e4b239f18ac21d030be1c223" },
    ] as VaultFile[],
    brief:
      "Checkout portal, 6 screens matching the design file, dark tokens, a11y AA on every field, no new runtime deps.",
  },
  client: "Dana Rowan (dana@marte.studio)",
  freelancer: "LoOse & Co (loose.co)",
};

/* The verdict record — COMPUTED vs JUDGED, incl. the real WARN row. */
export const EVIDENCE_EVENTS: { src: string; icon: "scan" | "fingerprint" | "file" | "clock"; body: string; payload?: string }[] = [
  {
    src: "integrity", icon: "fingerprint",
    body: "All five manifest rows re-hashed against the sealed values.",
    payload: 'sha256 match · 5/5 · avg 41ms/file\nmutation: none detected',
  },
  {
    src: "test-runner", icon: "clock",
    body: "Playwright suite ran against the staging checkout.",
    payload: "passed: 17 · failed: 0 · skipped: 1 · wall 6.2s",
  },
  {
    src: "brief", icon: "file",
    body: "Brief line-reader checked stated scope vs what was changed.",
    payload: "brief: \"dark tokens, a11y AA, no new deps\"\nfound: AA ✓ on 14/14 focusable fields\nfound: \"refund path not covered by tests\"",
  },
];

export const SKIPPED = { tests: 1, detail: "1 test skipped — refund path, not in brief" };

export const COMPUTED = [
  { name: "manifest integrity", result: "PASS", detail: "5/5 hashes match" },
  { name: "brief dependencies", result: "PASS", detail: "0 new runtime deps" },
  { name: "contrast audit", result: "PASS", detail: "14 fields ≥ 4.6:1" },
  { name: "skipped tests", result: "WARN", detail: SKIPPED.detail },
];

export const JUDGED = {
  headline: "Refund coverage is a judgment, not a computation",
  body:
    "The manifest and dep lockfile pass exactly — computed. That the skipped refund test (below) doesn't violate the brief is a judgment: the brief named the refund path out of scope. The client can overturn it. Nothing captures until the judgment is approved.",
};

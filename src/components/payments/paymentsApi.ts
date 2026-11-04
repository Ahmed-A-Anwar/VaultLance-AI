/* paymentsApi.ts — the Payments page's reads. Everything here is local and
   delayed on purpose, and every function names the endpoint it becomes once
   this is no longer a mock, so swapping it for the service is a change of
   import rather than a change of call sites.

   The two roles read two stores, and that is deliberate: the freelancer's
   payouts come from the freelancer's own vaults, the client's holds and
   receipts from the client's own ledger. The shapes and the arithmetic live in
   paymentsModel, which imports nothing that touches the network.

   Reads carry 300–618ms of latency and, behind FX.mockErrors, fail 5% of the
   time so the error and retry paths stay reachable. */

import { FX } from "../../config/fx";
import { hasPayoutEmail, listEvents, listVaults, readPayoutEmail } from "../../lib/api";
import {
  listFreelancerEvents,
  listFreelancerVaults,
  retryPayout as retryFreelancerPayout,
} from "../freelancer/mockApi";
import { MOCK_ERROR_RATE, MOCK_LATENCY_MS } from "../freelancer/mockConfig";
import {
  FAILURE_REASON,
  HOLD_DAYS,
  HONOR_DAYS,
  holdsFrom,
  payoutsFrom,
  receiptsFrom,
  type Hold,
  type Payout,
  type PayoutProfile,
  type Receipt,
} from "./paymentsModel";

export * from "./paymentsModel";

/* ================================================================ latency === */

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* demo switch, same spelling as lib/api's: ?slow=1 stretches every read so the
   skeletons can be seen */
const SLOW = typeof location !== "undefined" && new URLSearchParams(location.search).has("slow");

/** The same window the rest of the mock obeys, read from the same config. */
const latency = () =>
  SLOW
    ? 2600
    : MOCK_LATENCY_MS.min + Math.round(Math.random() * (MOCK_LATENCY_MS.max - MOCK_LATENCY_MS.min));

/* demo switch, same spelling as lib/api's: /dashboard/payments?empty=1 */
const EMPTY = typeof location !== "undefined" && new URLSearchParams(location.search).has("empty");

const maybeFail = () => {
  if (FX.mockErrors && Math.random() < MOCK_ERROR_RATE) {
    throw new Error("The payments service didn’t answer. Try again.");
  }
};

/* ================================================================= reads === */

/** GET /api/me/payout-profile — the one payout address the account settings
    store owns, so the Overview banner, Settings and this card cannot drift. */
export async function getPayoutProfile(): Promise<PayoutProfile> {
  await wait(latency());
  maybeFail();
  const on = hasPayoutEmail();
  return { paypalEmail: readPayoutEmail(), verified: on, currency: "USD" };
}

/** GET /api/me/payouts — the vault read already carries the delay.

    ?empty=1 is the demo switch lib/api already honours: it answers with no
    vaults so the empty states can be seen. The freelancer store has no such
    switch of its own, so it is honoured here, on the read. */
export async function listPayouts(): Promise<Payout[]> {
  const [vaults, events] = await Promise.all([listFreelancerVaults(), listFreelancerEvents()]);
  if (SLOW) await wait(latency());
  maybeFail();
  if (EMPTY) return [];
  return payoutsFrom(vaults, events);
}

/** GET /api/me/receipts */
export async function listReceipts(): Promise<Receipt[]> {
  const [vaults, events] = await Promise.all([listVaults(), listEvents()]);
  maybeFail();
  return receiptsFrom(vaults, events);
}

/** GET /api/me/holds */
export async function listHolds(): Promise<Hold[]> {
  const [vaults, events] = await Promise.all([listVaults(), listEvents()]);
  maybeFail();
  return holdsFrom(vaults, events);
}

/* ================================================================ writes === */

/** POST /api/vaults/{id}/payout/retry — the same call the details drawer makes. */
export async function retryPayout(vaultId: string): Promise<Payout> {
  const vault = await retryFreelancerPayout(vaultId);
  const events = await listFreelancerEvents();
  return payoutsFrom([vault], events)[0];
}

/* =============================================================== receipt === */

const receiptHtml = (r: Receipt): string => {
  const when = new Date(r.createdAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const amount = (r.amountCents / 100).toFixed(2);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>VaultLance receipt ${r.id}</title>
<style>
  @page { margin: 21mm; }
  body { font: 14px/1.5 Georgia, serif; color: #0e1520; margin: 0; }
  .mono { font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #4b5663; }
  h1 { font-size: 26px; margin: 8px 0 21px; }
  table { border-collapse: collapse; width: 100%; margin-top: 21px; }
  th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid rgba(138,149,161,.4); }
  th { font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: .14em; color: #4b5663; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  .mark { display: inline-block; padding: 4px 8px; border: 1px solid #b8893a; border-radius: 13px; font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: .14em; }
  footer { margin-top: 34px; font-size: 12px; color: #4b5663; }
</style></head>
<body>
  <p class="mono">Vaultlance escrow</p>
  <h1>Payment receipt</h1>
  <p class="mark">MOCK RECEIPT — NO MONEY MOVED</p>
  <table>
    <tr><th>Project</th><td>${r.project}</td></tr>
    <tr><th>Type</th><td>${r.kind === "capture" ? "Captured" : "Voided / released"}</td></tr>
    <tr><th>Date</th><td>${when}</td></tr>
    <tr><th>PayPal ID</th><td class="mono" style="text-transform:none">${r.paypalId}</td></tr>
    <tr><th>Amount</th><td class="n">$${amount}</td></tr>
  </table>
  <footer>Receipt ${r.id} · Vault ${r.vaultId} · Sandbox only: no real money moved.</footer>
</body></html>`;
};

/** GET /api/receipts/{id}.pdf — the mock builds a printable page and hands it
    to the browser's print preview, which is where a PDF would land anyway.

    A blob URL, not document.write: `noopener` windows hand back no handle, and
    writing into a blank one would mean dropping `noopener`. This way the
    receipt is a real same-origin-free document the browser can print on load. */
export function downloadReceipt(receipt: Receipt): boolean {
  const url = URL.createObjectURL(new Blob([receiptHtml(receipt)], { type: "text/html" }));
  const win = window.open(url, "_blank", "width=800,height=900");
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  win.addEventListener("load", () => win.print(), { once: true });
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export { FAILURE_REASON, HOLD_DAYS, HONOR_DAYS };

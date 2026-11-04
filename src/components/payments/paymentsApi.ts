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
import { listEvents, listVaults } from "../../lib/api";
import {
  hasPaypalEmail,
  listFreelancerEvents,
  listFreelancerVaults,
  retryPayout as retryFreelancerPayout,
} from "../freelancer/mockApi";
import { MOCK_ERROR_RATE, MOCK_LATENCY_MS } from "../freelancer/mockConfig";
import {
  FAILURE_REASON,
  HOLD_DAYS,
  HONOR_DAYS,
  MOCK_PAYPAL_EMAIL,
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

/** The same window the rest of the mock obeys, read from the same config. */
const latency = () =>
  MOCK_LATENCY_MS.min + Math.round(Math.random() * (MOCK_LATENCY_MS.max - MOCK_LATENCY_MS.min));

const maybeFail = () => {
  if (FX.mockErrors && Math.random() < MOCK_ERROR_RATE) {
    throw new Error("The payments service didn’t answer. Try again.");
  }
};

/* ================================================================= reads === */

/** GET /api/me/payout-profile */
export async function getPayoutProfile(): Promise<PayoutProfile> {
  await wait(latency());
  maybeFail();
  const on = hasPaypalEmail();
  return { paypalEmail: on ? MOCK_PAYPAL_EMAIL : null, verified: on, currency: "USD" };
}

/** GET /api/me/payouts — the vault read already carries the delay. */
export async function listPayouts(): Promise<Payout[]> {
  const [vaults, events] = await Promise.all([listFreelancerVaults(), listFreelancerEvents()]);
  maybeFail();
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
    to the browser's print preview, which is where a PDF would land anyway. */
export function downloadReceipt(receipt: Receipt): boolean {
  const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!win) return false;
  win.document.write(receiptHtml(receipt));
  win.document.close();
  win.focus();
  win.print();
  return true;
}

export { FAILURE_REASON, HOLD_DAYS, HONOR_DAYS };

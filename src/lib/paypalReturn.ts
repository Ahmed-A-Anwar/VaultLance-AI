/* paypalReturn.ts — what happens after PayPal sends the buyer back.

   PayPal's return_url lands on /vault/<id>?status=authorized&token=<orderId>
   &PayerID=… . That window may have no session at all (a popup never shares the
   tab's bearer token), and the SDK's onApprove may never have fired, so the
   authorization can go unrecorded and the page can only show a 401.

   So the order is remembered instead: the window that returns, and the tab that
   created the order, both write {vaultId, orderId} here, and whichever of them
   later has a session finishes the authorization. The value is the PayPal order
   id, which PayPal itself just put in a URL — never our bearer token.
*/

const KEY = "vl_paypal_approved";

export interface PendingApproval {
  vaultId: string;
  orderId: string;
  at: number;
}

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const readAll = (): PendingApproval[] => {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is PendingApproval =>
        Boolean(row) && typeof row.vaultId === "string" && typeof row.orderId === "string"
    );
  } catch {
    return [];
  }
};

const writeAll = (rows: PendingApproval[]): void => {
  try {
    if (rows.length === 0) storage()?.removeItem(KEY);
    else storage()?.setItem(KEY, JSON.stringify(rows.slice(-10)));
  } catch {
    /* storage refused: the page still finishes the authorization it just made */
  }
};

/** Remember an order the buyer approved, so any signed-in window can finish it. */
export function rememberApprovedOrder(vaultId: string, orderId: string): void {
  if (!vaultId || !orderId) return;
  const rows = readAll().filter((row) => row.vaultId !== vaultId);
  rows.push({ vaultId, orderId, at: Date.now() });
  writeAll(rows);
}

export function pendingApprovalFor(vaultId: string): PendingApproval | null {
  return readAll().find((row) => row.vaultId === vaultId) ?? null;
}

export function forgetApprovedOrder(vaultId: string): void {
  writeAll(readAll().filter((row) => row.vaultId !== vaultId));
}

/** The order PayPal sent back with, if this page load is that return. */
export function approvalFromUrl(url: string): { vaultId: string; orderId: string } | null {
  try {
    const parsed = new URL(url, window.location.origin);
    const orderId = parsed.searchParams.get("token");
    const status = (parsed.searchParams.get("status") || "").toLowerCase();
    const match = parsed.pathname.match(/^\/vault\/([^/]+)/);
    if (!match || !orderId) return null;
    /* `status=authorized` is ours; a bare token is still worth honouring,
       because PayPal's own redirect only guarantees the token */
    if (status && status !== "authorized" && status !== "approved" && status !== "success") return null;
    return { vaultId: decodeURIComponent(match[1]), orderId };
  } catch {
    return null;
  }
}

/** Drop PayPal's query string, so the order id does not linger in the address. */
export function cleanPaypalQuery(vaultId: string): void {
  try {
    if (!window.location.search) return;
    window.history.replaceState({}, "", `/vault/${encodeURIComponent(vaultId)}`);
  } catch {
    /* nothing to clean */
  }
}

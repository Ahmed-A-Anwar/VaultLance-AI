/* Client portal — read-only seal, sticky footer, gated approve; released state via the real flow. */
import { test, expect } from "@playwright/test";

const PORTAL = "/v/cx7-29kd-wq1m";

test("manifest rows are SEALED and never clickable", async ({ page }) => {
  await page.goto(PORTAL);
  // lazy route: wait for the manifest to mount before counting
  await expect(page.locator('[role="list"][aria-label="Manifest"]')).toBeVisible();
  const rows = page.locator(".mrow[data-locked=true]");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < Math.min(n, 5); i++) {
    await expect(rows.nth(i)).not.toContainText(/RELEASED/i);
  }
  // no download affordance: no <a> or download button while locked
  const affordances = await page.locator(".mrow[data-locked=true] a, .mrow[data-locked=true] .dlbtn").count();
  expect(affordances).toBe(0);
});

test("Approve & Pay is disabled with an inline reason before the first result", async ({ page }) => {
  await page.goto(PORTAL);
  const approve = page.getByTestId("approve-pay");
  await expect(approve).toBeDisabled();
  const reason = page.locator("#approve-pay-reason");
  await expect(reason).toBeVisible();
  const text = (await reason.textContent()) ?? "";
  expect(text.length).toBeGreaterThan(4);
});

test("sticky footer shows the HELD amount", async ({ page }) => {
  await page.goto(PORTAL);
  await expect(page.getByTestId("portal-foot")).toContainText(/\$4,250|4,250/);
});

test("asking a question returns provenance blocks and enables Approve & Pay", async ({ page }) => {
  await page.goto(PORTAL);
  await page.getByTestId("suggested-q").first().click();
  const stream = page.getByTestId("portal-stream");
  await expect(stream).toContainText(/source|payload|sha256|provenance/i, { ignoreCase: true });
  await expect(page.getByTestId("approve-pay")).toBeEnabled();
});

test("approve flips tokens to RELEASED with download rows", async ({ page }) => {
  await page.goto(PORTAL);
  await page.getByTestId("suggested-q").first().click(); // the gate: decide on evidence
  await page.getByTestId("approve-pay").click();
  await page.waitForURL(/\/files$/);
  const releasedRows = page.locator(".mrow[data-released=true]");
  await expect(releasedRows.first()).toContainText(/RELEASED/i);
  await expect(releasedRows.first()).toContainText(/Get|Download/i);
});

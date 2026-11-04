/* routing.spec.ts — the shell's route table, driven for both roles.

   Every /dashboard path renders its own page per role — never the Overview
   fallback — and the rail marks the route the page belongs to. The pure
   resolver is unit-checked too, so the switch behaviour is pinned even for
   rows no signed-in click can reach. */

import { test, expect, type Page } from "@playwright/test";
import { resolveDashArea } from "../src/pages/dashboard/routeTable";

const CLIENT = "client@northfield.co";
const FREELANCER = "freelancer@vaultlance.ai";

const GREETING = /Good (morning|afternoon|evening)/;

/* one expected first heading per table row, per role. /dashboard's first
   heading IS the greeting for both roles; every other row must read as its
   own page and never as the greeting. */
const HEADINGS: Record<string, Record<string, string | RegExp>> = {
  client: {
    "/dashboard": GREETING,
    "/dashboard/vaults": "Your vaults",
    "/dashboard/ledger": "Ledger",
    "/dashboard/payments": "Holds and receipts",
    "/dashboard/settings": "Settings.",
  },
  freelancer: {
    "/dashboard": GREETING,
    "/dashboard/vaults": "Vaults",
    "/dashboard/ledger": "Earnings",
    "/dashboard/payments": "Payments",
    /* the freelancer's own settings page — the client's grid wearing the
       role's sections, payouts included */
    "/dashboard/settings": "Settings.",
  },
};

/* the rail label each path lights up, per role */
const RAIL_LABELS: Record<string, Record<string, string>> = {
  client: {
    "/dashboard": "Overview",
    "/dashboard/vaults": "Vaults",
    "/dashboard/ledger": "Ledger",
    "/dashboard/payments": "Payments",
    "/dashboard/settings": "Settings",
  },
  freelancer: {
    "/dashboard": "Overview",
    "/dashboard/vaults": "Vaults",
    "/dashboard/ledger": "Earnings",
    "/dashboard/payments": "Payments",
    "/dashboard/settings": "Settings",
  },
};

type Role = "client" | "freelancer";

const seed = (page: Page, email: string, role: Role) =>
  page.addInitScript(
    ([seedEmail, seedRole]) => {
      Math.random = () => 0.9;
      if (!sessionStorage.getItem("vl.dash.session")) {
        sessionStorage.setItem(
          "vl.dash.session",
          JSON.stringify({ email: seedEmail, role: seedRole, since: Date.now() })
        );
      }
    },
    [email, role]
  );

/** the row's own heading, and no greeting on any other page */
async function expectOwnPage(page: Page, role: Role, path: string) {
  const expected = HEADINGS[role][path];
  const firstHeading = page.getByRole("heading").first();

  if (path === "/dashboard") {
    // the overview's h1 IS the greeting, for both roles
    await expect(firstHeading).toContainText(expected as RegExp);
  } else {
    await expect(firstHeading).toContainText(expected as string);
    await expect(page.getByRole("heading", { name: GREETING })).toHaveCount(0);
  }
}

/** the rail marks exactly this route's item active */
async function expectRailActive(page: Page, role: Role, path: string) {
  const label = RAIL_LABELS[role][path];
  const active = page.locator(".dash-nav-item.is-active");
  await expect(active).toHaveCount(1);
  await expect(active).toContainText(label);
}

for (const role of ["client", "freelancer"] as Role[]) {
  for (const path of Object.keys(HEADINGS[role])) {
    test(`${role}: ${path} renders its own page and its own rail item`, async ({ page }) => {
      await seed(page, role === "client" ? CLIENT : FREELANCER, role);
      await page.goto(path);
      await expectOwnPage(page, role, path);
      await expectRailActive(page, role, path);
    });
  }
}

test("an unknown dashboard path renders the shell's 404, inside the shell", async ({ page }) => {
  await seed(page, CLIENT, "client");
  await page.goto("/dashboard/definitely-not-a-route");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.locator(".dash-rail")).toBeVisible();
});

test("signed out, a dashboard path goes to /signin and not a loop", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem("vl.dash.session");
    } catch {
      /* nothing to clear */
    }
  });
  await page.goto("/dashboard/settings");
  await expect(page).toHaveURL(/\/signin$/);
});

test("the pure resolver: route rows, notAvailable rows, unknown paths", () => {
  // not part of the table at all
  expect(resolveDashArea("client", "/dashboard/elsewhere")).toEqual({ kind: "notFound" });
  // every table row exists for the client
  for (const path of Object.keys(HEADINGS.client)) {
    expect(resolveDashArea("client", path)).toEqual({ kind: "route" });
  }
  // every table row exists for the freelancer too, settings included
  expect(resolveDashArea("freelancer", "/dashboard/settings")).toEqual({ kind: "route" });
  // no session: the shell shows the client gate until the guard navigates
  expect(resolveDashArea(null, "/dashboard")).toEqual({ kind: "notAvailable", role: "client" });
});

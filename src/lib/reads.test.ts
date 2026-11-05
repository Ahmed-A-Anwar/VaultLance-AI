import { describe, expect, it } from "vitest";
import { POLL_BACKOFF_MS, POLL_MS, isTerminal, kpisOf, pollDelay, shouldPoll } from "./reads";
import type { Vault } from "./api";

const vault = (id: string, amountUSD: number, status: Vault["status"]): Vault => ({
  id,
  project: id,
  freelancer: "—",
  amountUSD,
  status,
  createdAt: 0,
});

describe("reads", () => {
  it("keeps the Overview figures on the same selectors as Payments", () => {
    const vaults = [vault("a", 180, "held"), vault("b", 24, "audited"), vault("c", 90, "unlocked"), vault("d", 300, "awaiting_payment"), vault("e", 50, "voided")];
    const kpis = kpisOf(vaults);
    expect(kpis.fundsHeld).toBe(204);
    expect(kpis.awaitingReview).toBe(1);
    /* unlocked stays the count the Overview card already shows */
    expect(kpis.unlocked).toBe(1);
  });

  it("adds cents without drifting", () => {
    const kpis = kpisOf([vault("a", 0.1, "held"), vault("b", 0.2, "held")]);
    expect(kpis.fundsHeld).toBeCloseTo(0.3, 10);
    expect(kpisOf([])).toEqual({ fundsHeld: 0, awaitingReview: 0, unlocked: 0 });
  });

  it("polls at five seconds and backs off to fifteen after three errors", () => {
    expect(pollDelay(0)).toBe(POLL_MS);
    expect(pollDelay(2)).toBe(POLL_MS);
    expect(pollDelay(3)).toBe(POLL_BACKOFF_MS);
    expect(pollDelay(99)).toBe(POLL_BACKOFF_MS);
  });

  it("stops once every vault is terminal", () => {
    expect(isTerminal(vault("a", 1, "unlocked"))).toBe(true);
    expect(isTerminal(vault("a", 1, "voided"))).toBe(true);
    expect(isTerminal(vault("a", 1, "audited"))).toBe(false);
    expect(shouldPoll([vault("a", 1, "voided"), vault("b", 1, "unlocked")])).toBe(false);
    expect(shouldPoll([vault("a", 1, "unlocked"), vault("b", 1, "held")])).toBe(true);
    expect(shouldPoll([])).toBe(false);
  });
});

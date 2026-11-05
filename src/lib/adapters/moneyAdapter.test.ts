import { describe, expect, it } from "vitest";
import { MAX_PRINTABLE_CENTS, centsOf, isPrintableCents, payoutCentsOf } from "./moneyAdapter";

describe("moneyAdapter", () => {
  it("converts dollars to integer cents once", () => {
    expect(centsOf(2400)).toBe(240_000);
    expect(centsOf(19.99)).toBe(1999);
    expect(centsOf(0)).toBe(0);
    expect(centsOf("450.00")).toBe(45_000);
    expect(centsOf(" 12.345 ")).toBe(1235);
  });

  it("keeps large amounts exact and free of floats", () => {
    expect(centsOf(1_000_000)).toBe(MAX_PRINTABLE_CENTS);
    expect(Number.isInteger(centsOf(999_999.99))).toBe(true);
    expect(centsOf(999_999.99)).toBe(99_999_999);
  });

  it("returns undefined rather than NaN for anything unreadable", () => {
    expect(centsOf(undefined)).toBeUndefined();
    expect(centsOf(null)).toBeUndefined();
    expect(centsOf("")).toBeUndefined();
    expect(centsOf("abc")).toBeUndefined();
    expect(centsOf("1,200")).toBeUndefined();
    expect(centsOf(Number.NaN)).toBeUndefined();
    expect(centsOf(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(centsOf({ amount: 5 })).toBeUndefined();
  });

  it("reads payout cents only as integers", () => {
    expect(payoutCentsOf(0)).toBe(0);
    expect(payoutCentsOf(12345)).toBe(12345);
    expect(payoutCentsOf(1.5)).toBeUndefined();
    expect(payoutCentsOf("12345")).toBeUndefined();
    expect(payoutCentsOf(-1)).toBeUndefined();
    expect(payoutCentsOf(undefined)).toBeUndefined();
  });

  it("guards a figure before it reaches a label", () => {
    expect(isPrintableCents(0)).toBe(true);
    expect(isPrintableCents(MAX_PRINTABLE_CENTS)).toBe(true);
    expect(isPrintableCents(MAX_PRINTABLE_CENTS + 1)).toBe(false);
    expect(isPrintableCents(undefined)).toBe(false);
    expect(isPrintableCents(Number.NaN)).toBe(false);
  });
});

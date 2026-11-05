/* moneyAdapter.ts — the one boundary where the API's dollar amount becomes the
   integer cents the UI counts in.

   Nothing here decides what is charged or paid: the server owns both. This
   rescales and rounds once, so every figure above this line is an integer and
   no surface ever adds a float to another float. A value the schema cannot read
   becomes undefined, which the UI prints as "—", never NaN. */

import { z } from "zod";

/** Dollars, as a number or a numeric string. */
export const amountSchema = z.union([
  z.number(),
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, "not a numeric amount"),
]);

/** Cents, as the server sends them: a whole, non-negative amount. */
export const centsSchema = z.number().int().nonnegative();

/** Dollars (number or numeric string) → integer cents, or undefined. */
export function centsOf(value: unknown): number | undefined {
  const parsed = amountSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const dollars = Number(parsed.data);
  if (!Number.isFinite(dollars)) return undefined;
  return Math.round(dollars * 100);
}

/** A payout amount the UI may print: integer cents, or undefined. */
export function payoutCentsOf(value: unknown): number | undefined {
  const parsed = centsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** $1,000,000 — the largest amount a vault may carry (fees.ts MAX_AMOUNT). */
export const MAX_PRINTABLE_CENTS = 100_000_000;

/** Guards a figure against a corrupted response before it reaches a label. */
export function isPrintableCents(cents: number | undefined): cents is number {
  return typeof cents === "number" && Number.isFinite(cents) && Math.abs(cents) <= MAX_PRINTABLE_CENTS;
}

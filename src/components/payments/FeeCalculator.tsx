/* FeeCalculator.tsx — what a vault of this size actually pays out. Every figure
   comes from lib/fees, the same module the drawer uses, so the calculator is a
   view of the fee logic and never a second copy of it.

   The input is dollars, because that is what a freelancer types; everything
   below the input is cents, because that is what the money is. */

import { useId, useState } from "react";
import { MIN_AMOUNT_CENTS, MAX_AMOUNT_CENTS, fees, formatCents } from "../../lib/fees";
import { useTween } from "./useTween";

const MIN_DOLLARS = MIN_AMOUNT_CENTS / 100;
const MAX_DOLLARS = MAX_AMOUNT_CENTS / 100;

/** "$4.50" with the cents the fee module rounded, not a second rounding. */
const tweenMoney = (cents: number) => formatCents(Math.round(cents));

export function FeeCalculator() {
  const id = useId();
  const [raw, setRaw] = useState("180");
  const parsed = Number.parseFloat(raw.replace(/[$,\s]/g, ""));
  const valid = Number.isFinite(parsed) && parsed >= MIN_DOLLARS && parsed <= MAX_DOLLARS;
  const amountCents = valid ? Math.round(parsed * 100) : 0;
  const split = fees(amountCents);

  const amount = useTween(split.amountCents);
  const vaultlance = useTween(split.vaultlanceFeeCents);
  const paypal = useTween(split.paypalFeeCents);
  const net = useTween(split.payoutCents);

  const problem = !raw.trim()
    ? "Enter an amount to see the split."
    : !Number.isFinite(parsed) || Number.isNaN(parsed)
      ? "That isn’t a number."
      : parsed < MIN_DOLLARS
        ? `The smallest vault is $${MIN_DOLLARS.toLocaleString("en-US")}.`
        : parsed > MAX_DOLLARS
          ? `The largest vault is $${MAX_DOLLARS.toLocaleString("en-US")}.`
          : null;

  return (
    <section className="pay-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="pay-card-h">
        Fee calculator
      </h2>

      <label className="pay-calc-label" htmlFor={`${id}-amt`}>
        VAULT AMOUNT
      </label>
      <div className="pay-calc-input">
        <span aria-hidden="true">$</span>
        <input
          id={`${id}-amt`}
          className="pay-input"
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          aria-invalid={problem ? "true" : undefined}
          aria-describedby={problem ? `${id}-err` : undefined}
          placeholder="180"
        />
      </div>
      {problem && (
        <p className="pay-calc-err" id={`${id}-err`} role="status">
          {problem}
        </p>
      )}

      <dl className="pay-calc-rows" data-valid={valid ? "true" : "false"}>
        <div>
          <dt>AMOUNT</dt>
          <dd>{formatCents(Math.round(amount))}</dd>
        </div>
        <div>
          <dt>VAULTLANCE FEE 5%</dt>
          <dd>−{tweenMoney(vaultlance)}</dd>
        </div>
        <div>
          <dt>PAYPAL FEE (EST.)</dt>
          <dd>−{tweenMoney(paypal)}</dd>
        </div>
        <div className="pay-calc-total">
          <dt>YOU RECEIVE (EST.)</dt>
          <dd>{formatCents(Math.round(net))}</dd>
        </div>
      </dl>
    </section>
  );
}

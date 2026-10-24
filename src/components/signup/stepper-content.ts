/* stepper-content.ts — the four steps of each role's path. Copy only: the
   stepper renders whatever is here, so the words can change without touching
   the component. */

export type Role = "freelancer" | "client";

export interface StepSpec {
  /* mono label, uppercase in the UI */
  label: string;
  /* one sentence, Inter 14px/1.618 */
  caption: string;
}

export const STEPPERS: Record<Role, StepSpec[]> = {
  freelancer: [
    { label: "Upload", caption: "Add your files or a staging link. They stay locked." },
    { label: "Authorize", caption: "Your client holds the payment on PayPal. Nothing is spent." },
    { label: "Audit", caption: "Real checks run. The client asks, the AI answers." },
    { label: "Get paid", caption: "Client approves. PayPal captures and pays you out." },
  ],
  client: [
    { label: "Authorize", caption: "Hold the payment on PayPal. Nothing is spent yet." },
    { label: "Interrogate", caption: "Ask the AI about the work. It runs real checks." },
    { label: "Decide", caption: "Approve to pay, or reject and the hold is voided." },
    { label: "Unlock", caption: "Payment captured. Files unlock for download." },
  ],
};

export const ROLE_NAME: Record<Role, string> = {
  freelancer: "Freelancer",
  client: "Client",
};

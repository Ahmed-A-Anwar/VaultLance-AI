/**
 * Return.tsx — the PayPal sandbox sends the buyer back here.
 *
 * The tab still owns the playground session. We claim the authorization with
 * the real reconcile route, run the deterministic checks, and hand the visitor
 * back to the playground where the capture button waits. If PayPal has not
 * confirmed yet, the page says so instead of pretending the hold exists.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  finishPaypalReturn,
  restorePlaygroundSession,
  switchPlaygroundRole,
} from "../../lib/playground";

export default function PlaygroundReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"working" | "unconfirmed" | "error">("working");
  const [message, setMessage] = useState("Claiming the PayPal authorization…");

  useEffect(() => {
    const vault = params.get("vault");
    const session = restorePlaygroundSession();
    if (!session || !vault) {
      setState("error");
      setMessage("This tab has no playground session. Start again from /playground.");
      return;
    }

    switchPlaygroundRole("client");
    let live = true;
    finishPaypalReturn()
      .then((result) => {
        if (!live) return;
        if (!result.claimed) {
          setState("unconfirmed");
          setMessage("PayPal has not confirmed this approval yet. Return to the playground and retry funding.");
          return;
        }
        setState("working");
        setMessage("Authorization recorded. The real checks are running…");
        navigate("/playground?funded=1", { replace: true });
      })
      .catch((err: Error) => {
        if (!live) return;
        setState("error");
        setMessage(err.message || "The PayPal return could not be completed.");
      });
    return () => {
      live = false;
    };
  }, [navigate, params]);

  return (
    <main className="pg pg-return">
      <div className="pg-return-card">
        <p className="pg-eyebrow">PAYPAL SANDBOX RETURN</p>
        <h1 className="pg-h1">{state === "working" ? "Finishing the hold." : state === "unconfirmed" ? "Not confirmed yet." : "Could not finish."}</h1>
        <p className="pg-lede" role="status">{message}</p>
        {state !== "working" && (
          <div className="pg-actions">
            <Link className="pg-btn pg-btn-primary" to="/playground">Back to the playground</Link>
          </div>
        )}
      </div>
    </main>
  );
}

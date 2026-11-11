import { useRef, useState } from "react";
import {
  destroySDKScript,
  getScriptID,
  PayPalButtons,
  PayPalScriptProvider,
  usePayPalScriptReducer,
} from "@paypal/react-paypal-js";
import { useToast } from "../shared/Toasts";
import { API_BASE_URL, apiClient } from "../../lib/apiClient";
import { authorizePaypalOrder, createPaypalOrder, reconcilePaypalOrder } from "../../lib/paypalWrites";
import { realOn } from "../../config/fx";

interface PayPalAuthorizeButtonProps {
  vaultId: string;
  amountUSD: number;
  onSuccess: (data: any) => void;
  onError?: (err: any) => void;
  disabled?: boolean;
}

export function PayPalAuthorizeButton({
  vaultId,
  amountUSD,
  onSuccess,
  onError,
  disabled = false,
}: PayPalAuthorizeButtonProps) {
  const [attempt, setAttempt] = useState(0);
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "BAA4Q0lxKMe-eEttZJdGKUOoM2AqGcE73TwoR1SPtbb_ofvrc1P1hwjp6UTUbO0l8E3jQo5deQixmDqI50";
  const options = {
    clientId,
    intent: "authorize" as const,
    currency: "USD",
    components: "buttons",
  };

  /* A failed SDK script stays in the document. Remove it before remounting the
     provider, or the retry would find the same rejected script and fail again. */
  const retry = () => {
    try {
      destroySDKScript(getScriptID(options));
    } catch {
      /* the script was never inserted, so there is nothing to remove */
    }
    setAttempt((n) => n + 1);
  };

  return (
    <div className="paypal-btn-wrapper" style={{ marginTop: "12px", minHeight: "45px" }}>
      <PayPalScriptProvider key={attempt} options={options}>
        <PayPalButtonMount
          vaultId={vaultId}
          amountUSD={amountUSD}
          onSuccess={onSuccess}
          onError={onError}
          disabled={disabled}
          onRetry={retry}
        />
      </PayPalScriptProvider>
    </div>
  );
}

function PayPalButtonMount({
  vaultId,
  amountUSD,
  onSuccess,
  onError,
  disabled,
  onRetry,
}: PayPalAuthorizeButtonProps & { onRetry: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [{ isPending, isRejected }] = usePayPalScriptReducer();
  /* set when the hold was already at PayPal and this click recorded it: the
     SDK call is then aborted on purpose, so its error toast must stay silent */
  const healed = useRef(false);

  const apiBase = API_BASE_URL.replace(/\/api$/, "");

  /* the same token the rest of the app sends, so funding cannot run as a
     different account than the one the room is showing */
  const getToken = () => apiClient.getToken() || "";

  if (isRejected) {
    return (
      <div className="paypal-btn-status" data-state="error" role="alert">
        <span>PayPal didn’t load.</span>
        <button type="button" className="paypal-btn-retry" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="paypal-btn-status" data-state="loading" role="status" aria-live="polite">
        <span className="dash-spin" aria-hidden="true" />
        <span>Loading PayPal…</span>
      </div>
    );
  }

  return (
    <PayPalButtons
          disabled={disabled || loading}
          style={{ layout: "horizontal", height: 40, tagline: false, shape: "rect", color: "gold" }}
          createOrder={async () => {
            setLoading(true);
            try {
              /* FX.real.payments routes both calls through the http client, so a
                 timeout or a 401 is a typed error instead of a bare message */
              if (realOn("payments")) {
                /* an approval that never came back through the browser is still
                   at PayPal: claim it here rather than ask for a second order
                   PayPal will refuse for this vault */
                const heal: { claimed: boolean; status?: string } = await reconcilePaypalOrder(vaultId).catch(
                  () => ({ claimed: false })
                );
                if (heal.claimed) {
                  healed.current = true;
                  toast({ message: `Already approved at PayPal — $${amountUSD} is held in escrow.`, tone: "success" });
                  onSuccess({ claimed: true, status: heal.status });
                  throw new Error("HOLD_ALREADY_RECORDED");
                }

                const order = await createPaypalOrder(vaultId);
                if (order.claimed) {
                  healed.current = true;
                  toast({ message: `Already approved at PayPal — $${amountUSD} is held in escrow.`, tone: "success" });
                  onSuccess({ claimed: true, status: order.status, authorizationId: order.authorizationId });
                  throw new Error("HOLD_ALREADY_RECORDED");
                }
                return order.orderId;
              }
              const res = await fetch(`${apiBase}/api/vaults/${vaultId}/payment/order`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${getToken()}`,
                },
                body: JSON.stringify({}),
              });

              if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.message || "Failed to create PayPal authorization order");
              }

              const data = await res.json();
              return data.data.orderId;
            } catch (err: any) {
              setLoading(false);
              if (healed.current) {
                onError?.(err);
                throw err;
              }
              toast({ message: err.message || "Order creation failed", tone: "error" });
              onError?.(err);
              throw err;
            }
          }}
          onApprove={async (data) => {
            try {
              if (realOn("payments")) {
                const auth = await authorizePaypalOrder(vaultId, data.orderID);
                toast({ message: `Payment authorized via PayPal: $${amountUSD} held in escrow!`, tone: "success" });
                onSuccess(auth);
                return;
              }
              const res = await fetch(`${apiBase}/api/vaults/${vaultId}/payment/authorize`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${getToken()}`,
                },
                body: JSON.stringify({ orderId: data.orderID }),
              });

              if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.message || "Failed to authorize order with PayPal");
              }

              const resData = await res.json();
              toast({ message: `Payment authorized via PayPal: $${amountUSD} held in escrow!`, tone: "success" });
              onSuccess(resData.data);
            } catch (err: any) {
              toast({ message: err.message || "Authorization failed", tone: "error" });
              onError?.(err);
            } finally {
              setLoading(false);
            }
          }}
          onCancel={() => {
            setLoading(false);
            toast({ message: "PayPal authorization was cancelled.", tone: "info" });
          }}
          onError={(err) => {
            setLoading(false);
            if (healed.current) {
              /* the popup was aborted because the hold was already recorded */
              healed.current = false;
              return;
            }
            loggerError(err);
            toast({ message: "PayPal encountered an error. Please try again.", tone: "error" });
            onError?.(err);
          }}
    />
  );
}

function loggerError(e: any) {
  console.error("[PayPal]", e);
}

import { useRef, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
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
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  /* set when the hold was already at PayPal and this click recorded it: the
     SDK call is then aborted on purpose, so its error toast must stay silent */
  const healed = useRef(false);

  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "BAA4Q0lxKMe-eEttZJdGKUOoM2AqGcE73TwoR1SPtbb_ofvrc1P1hwjp6UTUbO0l8E3jQo5deQixmDqI50";
  const apiBase = API_BASE_URL.replace(/\/api$/, "");

  /* the same token the rest of the app sends, so funding cannot run as a
     different account than the one the room is showing */
  const getToken = () => apiClient.getToken() || "";

  return (
    <div className="paypal-btn-wrapper" style={{ marginTop: "12px", minHeight: "45px" }}>
      <PayPalScriptProvider
        options={{
          clientId: clientId,
          intent: "authorize",
          currency: "USD",
          components: "buttons",
        }}
      >
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
      </PayPalScriptProvider>
    </div>
  );
}

function loggerError(e: any) {
  console.error("[PayPal]", e);
}

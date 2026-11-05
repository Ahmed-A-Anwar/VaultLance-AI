import { useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useToast } from "../shared/Toasts";
import { API_BASE_URL, apiClient } from "../../lib/apiClient";
import { authorizePaypalOrder, createPaypalOrder } from "../../lib/paypalWrites";
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

  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "BAA4Q0lxKMe-eEttZJdGKUOoM2AqGcE73TwoR1SPtbb_ofvrc1P1hwjp6UTUbO0l8E3jQo5deQixmDqI50";
  const apiBase = API_BASE_URL.replace(/\/api$/, "");

  const getToken = () => apiClient.getToken() ?? "";

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
                const { orderId } = await createPaypalOrder(vaultId);
                return orderId;
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

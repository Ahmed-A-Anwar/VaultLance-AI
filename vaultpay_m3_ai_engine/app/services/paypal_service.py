"""
VaultPay – PayPal Sandbox Integration
======================================
Creates and captures PayPal orders using the PayPal REST API v2.
Critically: payment release is NEVER triggered by the AI verification
engine.  Only a human-initiated API call can authorize payment capture.

Flow:
  1. Client creates an order (funds are NOT moved)
  2. Buyer approves on PayPal redirect
  3. Client calls POST /approve (human action) → order is captured
"""

import json
import httpx
from app.core.config import get_settings

settings = get_settings()

# PayPal API base URLs
PAYPAL_BASE = {
    "sandbox": "https://api-m.sandbox.paypal.com",
    "live": "https://api-m.paypal.com",
}


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Get OAuth2 access token from PayPal
# ─────────────────────────────────────────────────────────────────────────────
async def _get_access_token() -> str:
    """Authenticate with PayPal and return a short-lived access token."""
    base = PAYPAL_BASE.get(settings.paypal_mode, PAYPAL_BASE["sandbox"])
    url = f"{base}/v1/oauth2/token"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            data={"grant_type": "client_credentials"},
            auth=(settings.paypal_client_id, settings.paypal_client_secret),
            headers={"Accept": "application/json", "Accept-Language": "en_US"},
        )
    response.raise_for_status()
    return response.json()["access_token"]


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Create a PayPal order (funds are held, NOT captured yet)
# ─────────────────────────────────────────────────────────────────────────────
async def create_paypal_order(
    amount: float,
    currency: str,
    project_id: str,
    return_url: str,
    cancel_url: str,
) -> dict:
    """
    Create a PayPal order in INTENT=CAPTURE mode.
    Returns the full PayPal API response including approval URL.
    """
    base = PAYPAL_BASE.get(settings.paypal_mode, PAYPAL_BASE["sandbox"])
    token = await _get_access_token()

    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "amount": {
                    "currency_code": currency,
                    "value": f"{amount:.2f}",
                },
                "custom_id": str(project_id),  # track back to our project
                "description": f"VaultPay escrow for project {project_id}",
            }
        ],
        "application_context": {
            "return_url": return_url,
            "cancel_url": cancel_url,
            "brand_name": "VaultPay",
            "landing_page": "BILLING",
            "user_action": "PAY_NOW",
        },
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base}/v2/checkout/orders",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
    response.raise_for_status()
    return response.json()


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Capture a PayPal order (HUMAN-ONLY action)
# ─────────────────────────────────────────────────────────────────────────────
async def capture_paypal_order(paypal_order_id: str) -> dict:
    """
    Capture (complete) a PayPal order.  This moves funds from buyer to seller.

    ⚠️  This function MUST only be called after explicit human approval.
    The AI verification engine CANNOT call this function.
    """
    base = PAYPAL_BASE.get(settings.paypal_mode, PAYPAL_BASE["sandbox"])
    token = await _get_access_token()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base}/v2/checkout/orders/{paypal_order_id}/capture",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
    response.raise_for_status()
    return response.json()


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Get PayPal order status
# ─────────────────────────────────────────────────────────────────────────────
async def get_order_status(paypal_order_id: str) -> dict:
    """Fetch the current status of a PayPal order."""
    base = PAYPAL_BASE.get(settings.paypal_mode, PAYPAL_BASE["sandbox"])
    token = await _get_access_token()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{base}/v2/checkout/orders/{paypal_order_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    response.raise_for_status()
    return response.json()


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Verify PayPal webhook signature
# ─────────────────────────────────────────────────────────────────────────────
async def verify_webhook_signature(
    headers: dict[str, str],
    raw_body: bytes,
) -> bool:
    """
    Verify that a PayPal webhook event is authentic.
    Always verify webhook signatures before processing any event.
    """
    base = PAYPAL_BASE.get(settings.paypal_mode, PAYPAL_BASE["sandbox"])
    token = await _get_access_token()

    payload = {
        "auth_algo": headers.get("PAYPAL-AUTH-ALGO", ""),
        "cert_url": headers.get("PAYPAL-CERT-URL", ""),
        "transmission_id": headers.get("PAYPAL-TRANSMISSION-ID", ""),
        "transmission_sig": headers.get("PAYPAL-TRANSMISSION-SIG", ""),
        "transmission_time": headers.get("PAYPAL-TRANSMISSION-TIME", ""),
        "webhook_id": settings.paypal_webhook_id,
        "webhook_event": json.loads(raw_body),
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base}/v1/notifications/verify-webhook-signature",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )

    if response.status_code != 200:
        return False

    return response.json().get("verification_status") == "SUCCESS"

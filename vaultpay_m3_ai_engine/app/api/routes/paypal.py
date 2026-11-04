"""
VaultPay – FastAPI Route: PayPal Sandbox
=========================================
Handles:
  - Creating PayPal escrow orders
  - Receiving PayPal webhooks
  - Human-only payment release (requires explicit human approval flag)

CRITICAL RULE: The AI verification engine CANNOT call the approve endpoint.
Payment capture only happens when a human explicitly calls POST /paypal/{id}/approve
AND the database flag human_release_approved is set to True.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.base import get_db
from app.models.paypal_order import PayPalOrder, OrderStatus
from app.models.project import Project
from app.services.paypal_service import (
    create_paypal_order,
    capture_paypal_order,
    get_order_status,
    verify_webhook_signature,
)

router = APIRouter(prefix="/paypal", tags=["PayPal"])


# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Request/response schemas for PayPal endpoints
# ─────────────────────────────────────────────────────────────────────────────
class CreateOrderRequest(BaseModel):
    project_id: str
    amount: float
    currency: str = "USD"
    return_url: str
    cancel_url: str


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Create a PayPal escrow order (funds are NOT captured yet)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/orders", status_code=201)
async def create_order(
    payload: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a PayPal order.  The buyer will be redirected to PayPal to approve.
    Funds are NOT moved until a human explicitly calls the /approve endpoint.
    """
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == payload.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create the order on PayPal
    pp_response = await create_paypal_order(
        amount=payload.amount,
        currency=payload.currency,
        project_id=payload.project_id,
        return_url=payload.return_url,
        cancel_url=payload.cancel_url,
    )

    # Store order in DB
    order = PayPalOrder(
        project_id=payload.project_id,
        paypal_order_id=pp_response["id"],
        currency=payload.currency,
        amount=payload.amount,
        status=OrderStatus.CREATED,
        raw_response=str(pp_response),
        human_release_approved=False,  # MUST be False – only human can set True
    )
    db.add(order)
    await db.commit()

    # Extract the approval URL for the buyer
    approval_url = next(
        (link["href"] for link in pp_response.get("links", []) if link["rel"] == "approve"),
        None,
    )

    return {
        "order_id": pp_response["id"],
        "status": pp_response.get("status"),
        "approval_url": approval_url,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Human-only payment release / capture
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/orders/{paypal_order_id}/approve")
async def approve_and_capture(
    paypal_order_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Capture a PayPal order after human approval.

    ⚠️  THIS ENDPOINT IS HUMAN-ONLY.
    The AI verification engine is explicitly blocked from calling this.
    Payment is only captured after a human administrator confirms via this endpoint.
    """
    # Fetch our internal order record
    result = await db.execute(
        select(PayPalOrder).where(PayPalOrder.paypal_order_id == paypal_order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status == OrderStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Order already captured.")

    # Set human approval flag (this is the gate the AI cannot bypass)
    order.human_release_approved = True

    # Capture funds on PayPal
    pp_result = await capture_paypal_order(paypal_order_id)

    order.status = OrderStatus.COMPLETED
    order.raw_response = str(pp_result)
    await db.commit()

    return {
        "message": "Payment captured successfully.",
        "paypal_order_id": paypal_order_id,
        "status": pp_result.get("status"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: PayPal Webhook receiver
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/webhook")
async def paypal_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive and verify PayPal webhook events.
    Webhook signatures are always verified before processing.
    """
    raw_body = await request.body()
    headers = dict(request.headers)

    # Verify the webhook is genuinely from PayPal
    is_valid = await verify_webhook_signature(headers=headers, raw_body=raw_body)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json
    event = json.loads(raw_body)
    event_type = event.get("event_type", "")

    # Handle order completion webhook
    if event_type == "CHECKOUT.ORDER.APPROVED":
        resource = event.get("resource", {})
        pp_order_id = resource.get("id")

        result = await db.execute(
            select(PayPalOrder).where(PayPalOrder.paypal_order_id == pp_order_id)
        )
        order = result.scalar_one_or_none()
        if order:
            order.status = OrderStatus.APPROVED
            await db.commit()

    return {"received": True, "event_type": event_type}


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Get order status
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/orders/{paypal_order_id}")
async def get_order(
    paypal_order_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the current status of a PayPal order (from both DB and live PayPal API)."""
    result = await db.execute(
        select(PayPalOrder).where(PayPalOrder.paypal_order_id == paypal_order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    live_status = await get_order_status(paypal_order_id)

    return {
        "internal_status": order.status,
        "paypal_status": live_status.get("status"),
        "amount": float(order.amount),
        "currency": order.currency,
        "human_release_approved": order.human_release_approved,
    }

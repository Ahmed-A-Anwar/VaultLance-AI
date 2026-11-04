"""
Internal-key guard for the AI engine.

The API is the only caller. Everything except /health needs
`x-internal-key`, compared with hmac.compare_digest so a wrong key cannot be
found byte by byte. There is no CORS here on purpose: browsers never talk to
this service.

If INTERNAL_API_KEY is unset the service refuses every protected route (503)
instead of falling open.
"""

import hmac
import os

from fastapi import Request
from fastapi.responses import JSONResponse

PUBLIC_PATHS = {"/health"}


def _configured_key() -> str:
    return os.getenv("INTERNAL_API_KEY", "")


async def require_internal_key(request: Request, call_next):
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)

    expected = _configured_key()
    if not expected:
        return JSONResponse(
            {"detail": "INTERNAL_API_KEY is not configured on this service."},
            status_code=503,
        )

    provided = request.headers.get("x-internal-key", "")
    if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        return JSONResponse({"detail": "Forbidden"}, status_code=403)

    return await call_next(request)

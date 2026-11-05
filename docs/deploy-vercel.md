# Deploying the frontend on Vercel

The app is a Vite single-page build. Vercel serves `dist/` and a catch-all
rewrite hands every client route to `index.html` so a refresh on a deep link
loads the app instead of a 404.

## SPA fallback

`vercel.json` keeps one rewrite:

```json
{ "source": "/(.*)", "destination": "/index.html" }
```

Vercel checks the filesystem before applying a rewrite, so `/assets/*.js`,
`/wheel-turn/*`, `/keypad-frames/*` and the rest of `public/` are still served
as themselves. The previous config listed `/signup`, `/signin`, `/console`,
`/demo`, `/dashboard`, `/vault/:path*` and `/v/:path*` one by one, which meant
any route added later 404'd on refresh until someone remembered to edit the list.

Existing cache headers for the two frame directories are unchanged.

## What is built

`npm run build` runs `tsc --noEmit` and then `vite build` into `dist/`. Only
`VITE_*` variables reach the bundle; `VITE_API_URL` points the browser at the
Express API on Fly. No secret belongs on this host — the API key stays on the
backend, and the bearer token lives in memory only.

## CSP: proposed, not enforced

No Content-Security-Policy header is set today. Adding one to a running product
without being able to test the deployed result risks a blank page, because the
policy has to allow the PayPal SDK, Supabase (if a build still initialises it)
and the API origin. When it is switched on, add it to `headers` and verify each
of these on the deployed URL:

| Directive | Needs | Why |
| --- | --- | --- |
| `script-src 'self' https://www.paypal.com https://www.sandbox.paypal.com` | the PayPal JS SDK | the approve button loads its script from PayPal |
| `frame-src https://www.paypal.com https://www.sandbox.paypal.com` | the checkout iframe | approval happens inside PayPal's frame |
| `connect-src 'self' https://vaultlance-ai.fly.dev https://*.supabase.co https://api-m.sandbox.paypal.com` | API and SDK calls | the browser talks to the API directly |
| `img-src 'self' data: https:` | QR codes and avatars | `qrcode` renders a data URL |
| `style-src 'self' 'unsafe-inline'` | React style attributes | inline styles are used by the animation layer |
| `font-src 'self'` | `@fontsource` files | fonts are bundled, not fetched from a CDN |

Start with `Content-Security-Policy-Report-Only`, load sign-in, a vault with a
PayPal button, the audit chat and the download flow, and only then enforce it.
```

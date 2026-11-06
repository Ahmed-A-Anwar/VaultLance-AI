/// <reference types="vite/client" />

/* The public, build-time values the frontend is allowed to know. Anything that
   is not declared here cannot be read with import.meta.env, which keeps a
   server secret from being pasted into a VITE_ variable by accident. */
interface ImportMetaEnv {
  /** Where the Express API lives, e.g. https://vaultlance-ai.fly.dev/api */
  readonly VITE_API_URL?: string;
  /** Master switch for the Phase 2 real-API wiring. Default false. */
  readonly VITE_USE_REAL_API?: string;
  /** Development only: lets the mock failures be turned on. Never in production. */
  readonly VITE_MOCK_ERRORS?: string;
  /** Runs the offline demo instead of calling the API. */
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_ENABLE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

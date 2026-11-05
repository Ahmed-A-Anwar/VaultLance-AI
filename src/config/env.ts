/* env.ts — the one reader for build-time flags.

   Vite inlines import.meta.env at build time, so a flag that is absent is
   undefined rather than "false"; this normalises both. Reading it through a
   function also keeps the call sites from importing the whole env object. */

const raw = (name: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  const value = env[name];
  return value === undefined || value === null ? "" : String(value);
};

/** True only when the flag is exactly "true". */
export const envFlag = (name: string): boolean => raw(name).toLowerCase() === "true";

/** True in a production build (import.meta.env.PROD, as Vite defines it). */
export const isProd = (): boolean =>
  (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true;

/** True on the dev server only. */
export const isDev = (): boolean =>
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

/** A public value, for the few places that need the string itself. */
export const envValue = (name: string): string => raw(name);

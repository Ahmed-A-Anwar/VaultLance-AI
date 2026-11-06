/**
 * demoGate.ts — where demo surfaces are allowed to exist.
 *
 * A demo build fabricates a session and vaults with no server behind it. That is
 * useful locally and dangerous on a deployed site: a visitor (or a judge) can
 * land in a signed-in shell showing money that does not exist. So demo mode is
 * available only when the bundle is a dev build, or when the build explicitly
 * opted in with VITE_ENABLE_DEMO=true.
 */
export const demoAllowedInBuild = (dev: boolean, flag: string | undefined): boolean =>
  dev || flag === "true";

export const demoBuildEnabled = (): boolean =>
  demoAllowedInBuild(Boolean(import.meta.env.DEV), import.meta.env.VITE_ENABLE_DEMO);

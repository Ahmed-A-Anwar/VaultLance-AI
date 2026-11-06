/**
 * The one shape the invite table stores: VL-XXXX-XXXX.
 *
 * A client may type it lower case, with spaces, or without the dashes. All of
 * those normalize to the canonical string; anything else is null, so the route
 * can answer its single generic 404.
 */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  const match = /^VL([A-Z0-9]{4})([A-Z0-9]{4})$/.exec(compact);
  return match ? `VL-${match[1]}-${match[2]}` : null;
}

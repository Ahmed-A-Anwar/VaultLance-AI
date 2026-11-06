/**
 * VL-XXXX-XXXX, however the client typed it: lower case, spaces and missing
 * dashes are accepted; everything else is null. The API applies the same rule,
 * so the client never has to guess which spelling the server wants.
 */
export function normalizeInviteCode(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  const match = /^VL([A-Z0-9]{4})([A-Z0-9]{4})$/.exec(compact);
  return match ? `VL-${match[1]}-${match[2]}` : null;
}

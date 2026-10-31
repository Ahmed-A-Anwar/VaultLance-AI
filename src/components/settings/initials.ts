/* initials.ts — the two letters in every avatar on this page, derived from the
   name that was saved. One implementation, so the profile chip and the summary
   card can never disagree. */

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "VA"
  );
}

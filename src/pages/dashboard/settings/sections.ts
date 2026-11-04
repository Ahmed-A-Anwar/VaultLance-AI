/* sections.ts — the one place the settings sections, their order and their copy
   live, keyed by role. The client page renders the client list; the freelancer
   dashboard is still its own coming-soon page, but its key is here so the same
   array can drive it later without a second source of truth. */

import type { Role } from "../../../lib/mockAuth";

export type SectionKey = "profile" | "payouts" | "notifications" | "security" | "preferences" | "danger";

export interface SectionDef {
  key: SectionKey;
  /* the nav item */
  label: string;
  /* the card's h2 */
  title: string;
  caption: string;
  danger?: boolean;
  /* role gate: a section only one side of the arrangement gets */
  freelancerOnly?: boolean;
}

export const SECTION_DEFS: Record<SectionKey, SectionDef> = {
  profile: {
    key: "profile",
    label: "Profile",
    title: "Profile",
    caption: "HOW YOU APPEAR TO FREELANCERS",
  },
  payouts: {
    key: "payouts",
    label: "Payouts",
    title: "Payouts",
    caption: "WHERE THE MONEY LANDS",
    freelancerOnly: true,
  },
  notifications: {
    key: "notifications",
    label: "Notifications",
    title: "Notifications",
    caption: "CHOOSE HOW WE REACH YOU",
  },
  security: {
    key: "security",
    label: "Security",
    title: "Security",
    caption: "PASSWORD, TWO-FACTOR AND DEVICES",
  },
  preferences: {
    key: "preferences",
    label: "Preferences",
    title: "Preferences",
    caption: "MOTION AND KEYBOARD",
  },
  danger: {
    key: "danger",
    label: "Danger zone",
    title: "Danger zone",
    caption: "THESE ACTIONS CAN'T BE UNDONE EASILY",
    danger: true,
  },
};

export const SECTIONS: Record<Role, SectionKey[]> = {
  client: ["profile", "notifications", "security", "preferences", "danger"],
  /* the freelancer's settings: payouts sits right after the profile, which owns
     the payout email the Overview banner and the Payments page read */
  freelancer: ["profile", "payouts", "notifications", "security", "preferences", "danger"],
};

export const listFor = (role: Role): SectionDef[] => SECTIONS[role].map((key) => SECTION_DEFS[key]);

export const isSectionKey = (value: string): value is SectionKey =>
  value === "profile" ||
  value === "payouts" ||
  value === "notifications" ||
  value === "security" ||
  value === "preferences" ||
  value === "danger";

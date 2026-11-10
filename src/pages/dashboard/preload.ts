import type { Role } from "../../lib/mockAuth";

/* DashboardLayout and each area are lazy routes. React keeps the outgoing page
   on screen while a navigation waits for a lazy chunk, so a sign-in that only
   starts the dashboard download after navigate() leaves the sign-in form up
   under /dashboard. Warming the route while the reader is still on /signin (and
   awaiting it before navigating) lets the shell commit on the route change. */

let shell: Promise<unknown> | null = null;
const areas = new Map<Role, Promise<unknown>>();

export function preloadDashboard(role?: Role): Promise<unknown> {
  shell ??= import("./DashboardLayout");
  if (!role) return shell;

  let area = areas.get(role);
  if (!area) {
    area =
      role === "freelancer"
        ? import("./freelancer/FreelancerDashboard")
        : import("./Overview");
    areas.set(role, area);
  }

  return Promise.all([shell, area]);
}

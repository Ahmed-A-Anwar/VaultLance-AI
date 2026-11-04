/* RoleGate.tsx — the pages that are not a route, plus the route resolver the
   shell renders with.

   NotAvailable is for a table row whose component the signed-in role does not
   have; NotFoundPage is the shell's 404 for a path the table does not know.
   Both render inside the dashboard shell (rail and strip stay), and neither
   ever renders the Overview. The look is the settings page's plain-area style:
   heading, one line, one action.

   DashArea imports the session, so it lives here — routeTable.tsx stays a pure
   table the tests can import without dragging browser code into Node. */

import { useSession } from "../../components/dashboard/session";
import { DASH_ROUTES, resolveDashArea, type DashPath } from "./routeTable";

export function DashArea({ path }: { path: DashPath }) {
  const { session } = useSession();

  /* signed out: the shell's guard is navigating to /signin; render nothing so
     a half-state can never flash a page under the wrong session */
  if (!session) return null;

  const resolved = resolveDashArea(session.role, path);
  if (resolved.kind === "notFound") return <NotFoundPage />;
  if (resolved.kind === "notAvailable") return <NotAvailable role={resolved.role} />;

  const Area = DASH_ROUTES[path][session.role];
  return Area ? <Area /> : <NotAvailable role={session.role} />;
}

export function NotAvailable({ role }: { role: string }) {
  return (
    <section className="dash-plain" aria-labelledby="dash-role-h">
      <h1 id="dash-role-h" className="dash-plain-h">
        Not available for your role
      </h1>
      <p className="dash-mono dim">
        {role === "freelancer" ? "This area is for clients." : "This area is for freelancers."}
      </p>
      <button type="button" className="dash-btn dash-btn-ghost" onClick={() => (window.location.href = "/dashboard")}>
        <span className="dash-btn-label">Back to Overview</span>
      </button>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="dash-plain" aria-labelledby="dash-404-h">
      <h1 id="dash-404-h" className="dash-plain-h">
        Page not found
      </h1>
      <p className="dash-mono dim">No dashboard area lives at this address.</p>
      <button type="button" className="dash-btn dash-btn-ghost" onClick={() => (window.location.href = "/dashboard")}>
        <span className="dash-btn-label">Back to Overview</span>
      </button>
    </section>
  );
}

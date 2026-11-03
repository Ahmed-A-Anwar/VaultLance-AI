/* DashboardLayout.tsx — the dashboard shell. One session read guards every
   /dashboard route: no session goes to /signin, a client gets the areas it had,
   a freelancer gets the same shell with its own rail labels, badge and one
   action, and its own overview page behind FX.freelancerDashboard.

   The client path is unchanged: Rail and TopStrip are rendered without their
   role props, so they fall back to the defaults they shipped with. */

import { useMemo, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Rail } from "../../components/dashboard/Rail";
import { TopStrip } from "../../components/dashboard/TopStrip";
import { DashUiProvider, useDashUi } from "../../components/dashboard/ui";
import { DashDataProvider } from "../../components/dashboard/data";
import { SessionProvider, useSession } from "../../components/dashboard/session";
import { ToastProvider } from "../../components/shared/Toasts";
import { DevPanel } from "../../components/dashboard/DevPanel";
import { FreelancerView } from "./Freelancer";
import { FreelancerDashboard } from "./freelancer/FreelancerDashboard";
import { FREELANCER_BADGE, FREELANCER_NAV, NEW_VAULT_EVENT, freelancerTitleFor } from "./freelancer/roles";
import { FX } from "../../config/fx";
import "../../styles/dashboard.css";
import "../../styles/freelancer.css";

const TITLES: Array<[string, string]> = [
  ["/dashboard/vaults", "Vaults"],
  ["/dashboard/ledger", "Ledger"],
  ["/dashboard/payments", "Payments"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard", "Overview"],
];

export function titleFor(pathname: string): string {
  const hit = TITLES.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return hit?.[1] ?? "Overview";
}

/* the strip's vault search earns its place only where vaults are listed */
const NO_SEARCH = new Set(["/dashboard/ledger", "/dashboard/payments", "/dashboard/settings"]);

function Surface() {
  const { session, signOut } = useSession();
  const { setJoinOpen } = useDashUi();
  const location = useLocation();
  const navigate = useNavigate();

  const root = useRef<HTMLDivElement>(null);
  /* signing out navigates to the landing page; without this the empty-session
     guard would race that navigation and send the user to /signin instead */
  const leaving = useRef(false);

  const isFreelancer = session?.role === "freelancer";

  /* the route name in the strip; the greeting inside the page is the h1 */
  const title = useMemo(
    () => (isFreelancer ? freelancerTitleFor(location.pathname) : titleFor(location.pathname)),
    [location.pathname, isFreelancer]
  );

  const showSearch = !NO_SEARCH.has(location.pathname);

  if (!session) return leaving.current ? null : <Navigate to="/signin" replace />;

  const join = () => {
    setJoinOpen(true);
    if (location.pathname !== "/dashboard" && !location.pathname.startsWith("/dashboard/vaults")) {
      navigate("/dashboard");
    }
  };

  return (
    <div className="dash" ref={root}>
      <a className="dash-skip" href="#main">
        Skip to content
      </a>

      <Rail
        session={session}
        signOut={() => {
          leaving.current = true;
          signOut();
          navigate("/");
        }}
        {...(isFreelancer
          ? { items: FREELANCER_NAV, badge: { label: FREELANCER_BADGE, className: "is-freelancer" } }
          : {})}
      />

      <div className="dash-main">
        <TopStrip
          title={title}
          onJoin={join}
          showSearch={showSearch}
          {...(isFreelancer
            ? {
                primary: {
                  label: "New vault",
                  withPlus: true,
                  /* the drawer mounts in slice 5 and listens for this */
                  onClick: () => window.dispatchEvent(new CustomEvent(NEW_VAULT_EVENT)),
                },
              }
            : {})}
        />
        <main id="main" className="dash-body">
          {isFreelancer ? (
            FX.freelancerDashboard ? (
              <FreelancerDashboard email={session.email} />
            ) : (
              <FreelancerView email={session.email} />
            )
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <DevPanel />
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <SessionProvider>
      <DashUiProvider>
        <ToastProvider>
          <DashDataProvider>
            <Surface />
          </DashDataProvider>
        </ToastProvider>
      </DashUiProvider>
    </SessionProvider>
  );
}

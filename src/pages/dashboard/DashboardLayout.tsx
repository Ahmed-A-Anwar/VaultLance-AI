/* DashboardLayout.tsx — the dashboard shell. One session read guards every
   /dashboard route: no session goes to /signin, a freelancer gets the same rail
   with a coming-soon page, a client gets the areas. The data is read once here
   so the rail, the strip and every area share it. */

import { useMemo, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Rail } from "../../components/dashboard/Rail";
import { TopStrip } from "../../components/dashboard/TopStrip";
import { DashUiProvider, useDashUi } from "../../components/dashboard/ui";
import { DashDataProvider } from "../../components/dashboard/data";
import { SessionProvider, useSession } from "../../components/dashboard/session";
import { ToastProvider } from "../../components/dashboard/Toasts";
import { DevPanel } from "../../components/dashboard/DevPanel";
import { FreelancerView } from "./Freelancer";
import "../../styles/dashboard.css";

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

function Surface() {
  const { session, signOut } = useSession();
  const { setJoinOpen } = useDashUi();
  const location = useLocation();
  const navigate = useNavigate();

  const root = useRef<HTMLDivElement>(null);
  /* signing out navigates to the landing page; without this the empty-session
     guard would race that navigation and send the user to /signin instead */
  const leaving = useRef(false);

  /* the route name in the strip; the greeting inside the page is the h1 */
  const title = useMemo(
    () => (session?.role === "freelancer" ? "Freelancer" : titleFor(location.pathname)),
    [location.pathname, session?.role]
  );

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
      />

      <div className="dash-main">
        <TopStrip title={title} onJoin={join} />
        <main id="main" className="dash-body">
          {session.role === "freelancer" ? <FreelancerView email={session.email} /> : <Outlet />}
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

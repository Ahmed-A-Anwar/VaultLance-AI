import { lazy, Suspense, useEffect, useRef } from "react";
import {
  RouterProvider,
  createBrowserRouter,
  Outlet,
  RouteObject,
  useLocation,
  useNavigate,
} from "react-router-dom";
import VaultLayout from "./layouts/VaultLayout";
import { DashArea } from "./pages/dashboard/RoleGate";
import { NotFoundPage } from "./pages/dashboard/RoleGate";
import { clearSession } from "./lib/mockAuth";
import { setUnauthorizedHandler } from "./lib/http";
import { demoBuildEnabled } from "./lib/demoGate";
import PlaygroundBar from "./components/PlaygroundBar";

const Landing = lazy(() => import("./pages/Landing"));
const Signup = lazy(() => import("./pages/Signup"));
const Signin = lazy(() => import("./pages/Signin"));
/* the reset flow: its own card in the same deck column, on the same vault */
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const VaultNew = lazy(() => import("./pages/VaultNew"));
/* the audit room owns /vault/:id now: it is the client's side of the escrow */
const AuditRoom = lazy(() => import("./pages/vault/AuditRoom"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientFiles = lazy(() => import("./pages/ClientFiles"));
const Console = lazy(() => import("./pages/Console"));
const Demo = lazy(() => import("./pages/Demo"));
const Playground = lazy(() => import("./pages/Playground"));
const PlaygroundReturn = lazy(() => import("./pages/playground/Return"));
/* the client dashboard. One shell for every area, so the rail and the strip
   never remount between its routes. The area each path renders comes from the
   route table (pages/dashboard/routeTable.tsx), not from the route tree. */
const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout"));

const Fallback = () => <p role="status" style={{ padding: "var(--s-8)" }}>Loading…</p>;

/* Every route had the landing page's title, so a tab or a bookmark said nothing
   about where the reader was. One map, read on each route change. */
const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "VaultLance AI — escrow that releases when the work checks out"],
  [/^\/signup/, "Create your account — VaultLance AI"],
  [/^\/signin/, "Sign in — VaultLance AI"],
  [/^\/forgot-password/, "Reset your password — VaultLance AI"],
  [/^\/reset-password/, "Choose a new password — VaultLance AI"],
  [/^\/playground\/return/, "Payment return — VaultLance AI"],
  [/^\/playground/, "Playground — VaultLance AI"],
  [/^\/dashboard\/vaults/, "Vaults — VaultLance AI"],
  [/^\/dashboard\/ledger/, "Ledger — VaultLance AI"],
  [/^\/dashboard\/payments/, "Payments — VaultLance AI"],
  [/^\/dashboard\/settings/, "Settings — VaultLance AI"],
  [/^\/dashboard/, "Overview — VaultLance AI"],
  [/^\/vault\/new/, "New vault — VaultLance AI"],
  [/^\/vault\//, "Audit room — VaultLance AI"],
  [/^\/v\//, "Your vault — VaultLance AI"],
];

function useDocumentTitle(pathname: string) {
  useEffect(() => {
    const hit = TITLES.find(([pattern]) => pattern.test(pathname));
    document.title = hit ? hit[1] : "VaultLance AI";
  }, [pathname]);
}

function Shell() {
  /* One door for a lost session. A 401 has already been cleared by the http
     client; here the reader goes to /signin carrying the page they were on, so
     signing in can send them straight back. Navigating only when they are not
     already on /signin is what keeps this from looping. */
  const navigate = useNavigate();
  const location = useLocation();

  useDocumentTitle(location.pathname);

  /* A route change unmounts the focused control, so focus falls to <body> and a
     keyboard reader starts over. Hand it to the new page's main landmark. */
  const firstPath = useRef(location.pathname);
  useEffect(() => {
    if (firstPath.current === location.pathname) return;
    const id = window.setTimeout(() => {
      const main = document.getElementById("main");
      if (!main) return;
      if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  useEffect(() => {
    const leave = () => {
      clearSession();
      if (location.pathname === "/signin") return;
      navigate("/signin", {
        replace: true,
        state: { from: `${location.pathname}${location.search}` },
      });
    };

    setUnauthorizedHandler(leave);
    /* the older api client reports the same 401 as an event, so both paths
       land on one door */
    window.addEventListener("vl:unauthorized", leave);
    return () => {
      setUnauthorizedHandler(null);
      window.removeEventListener("vl:unauthorized", leave);
    };
  }, [navigate, location.pathname, location.search]);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <PlaygroundBar />
      <Suspense fallback={<Fallback />}>
        <Outlet />
      </Suspense>
    </>
  );
}

/* Seeded demo and legacy surfaces are routes only in a build that explicitly
   permits demo mode. A production visitor gets the ordinary 404 instead of a
   fabricated signed-in portal, console, or demo replay. */
const demoRoutes: RouteObject[] = demoBuildEnabled()
  ? [
      { path: "/v/:token", element: <ClientPortal /> },
      { path: "/v/:token/files", element: <ClientFiles /> },
      { path: "/console", element: <Console /> },
      { path: "/demo", element: <Demo /> },
    ]
  : [];

const routes: RouteObject[] = [
  /* the vault mounts once here and both routes render inside it */
  {
    element: <VaultLayout />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/signup", element: <Signup /> },
      { path: "/signin", element: <Signin /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },
    ],
  },
  { path: "/vault/new", element: <VaultNew /> },
  { path: "/vault/:id", element: <AuditRoom /> },
  { path: "/playground", element: <Playground /> },
  { path: "/playground/return", element: <PlaygroundReturn /> },
  ...demoRoutes,
  /* the dashboard: a guarded shell with one area per path, keyed by the route
     table. The wildcard keeps unknown /dashboard paths inside the shell. */
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <DashArea path="/dashboard" /> },
      { path: "vaults", element: <DashArea path="/dashboard/vaults" /> },
      { path: "ledger", element: <DashArea path="/dashboard/ledger" /> },
      { path: "payments", element: <DashArea path="/dashboard/payments" /> },
      { path: "settings", element: <DashArea path="/dashboard/settings" /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  { path: "*", element: <p className="wrap" style={{ paddingBlock: "var(--s-20)" }}>Nothing here. <a href="/">The instrument is over here.</a></p> },
];

const router = createBrowserRouter([{ element: <Shell />, children: routes }]);

export default function App() {
  return <RouterProvider router={router} />;
}

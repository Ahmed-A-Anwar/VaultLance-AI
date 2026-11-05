import { lazy, Suspense, useEffect } from "react";
import {
  RouterProvider,
  createBrowserRouter,
  Navigate,
  Outlet,
  RouteObject,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import VaultLayout from "./layouts/VaultLayout";
import { DashArea } from "./pages/dashboard/RoleGate";
import { NotFoundPage } from "./pages/dashboard/RoleGate";
import { clearSession } from "./lib/mockAuth";
import { setUnauthorizedHandler } from "./lib/http";

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
/* the client dashboard. One shell for every area, so the rail and the strip
   never remount between its routes. The area each path renders comes from the
   route table (pages/dashboard/routeTable.tsx), not from the route tree. */
const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout"));

const Fallback = () => <p role="status" style={{ padding: "var(--s-8)" }}>Loading…</p>;

/* the old deep link: /playground?vault=<id> is the audit room at its own
   address now, and /playground alone is still a placeholder */
function Playground() {
  const [params] = useSearchParams();
  const vault = params.get("vault");
  if (vault) return <Navigate to={`/vault/${vault}`} replace />;
  return (
    <main id="main" className="wrap" style={{ padding: "var(--s-20) var(--s-5)" }}>
      <h1 style={{ fontSize: "1.5rem" }}>The playground moved.</h1>
      <p className="small">Open a vault from the dashboard to run its audit.</p>
    </main>
  );
}

function Shell() {
  /* One door for a lost session. A 401 has already been cleared by the http
     client; here the reader goes to /signin carrying the page they were on, so
     signing in can send them straight back. Navigating only when they are not
     already on /signin is what keeps this from looping. */
  const navigate = useNavigate();
  const location = useLocation();

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
      <Suspense fallback={<Fallback />}>
        <Outlet />
      </Suspense>
    </>
  );
}

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
  { path: "/v/:token", element: <ClientPortal /> },
  { path: "/v/:token/files", element: <ClientFiles /> },
  { path: "/console", element: <Console /> },
  { path: "/demo", element: <Demo /> },
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

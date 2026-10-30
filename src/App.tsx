import { lazy, Suspense } from "react";
import { RouterProvider, createBrowserRouter, Navigate, Outlet, RouteObject, useSearchParams } from "react-router-dom";
import VaultLayout from "./layouts/VaultLayout";

const Landing = lazy(() => import("./pages/Landing"));
const Signup = lazy(() => import("./pages/Signup"));
const Signin = lazy(() => import("./pages/Signin"));
const VaultNew = lazy(() => import("./pages/VaultNew"));
/* the audit room owns /vault/:id now: it is the client's side of the escrow */
const AuditRoom = lazy(() => import("./pages/vault/AuditRoom"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientFiles = lazy(() => import("./pages/ClientFiles"));
const Console = lazy(() => import("./pages/Console"));
const Demo = lazy(() => import("./pages/Demo"));
/* the client dashboard. One shell for every area, so the rail and the strip
   never remount between its routes. */
const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout"));
const DashboardOverview = lazy(() => import("./pages/dashboard/Overview"));
const DashboardVaults = lazy(() => import("./pages/dashboard/VaultsPage"));
const DashboardLedger = lazy(() => import("./pages/dashboard/LedgerPage"));
const DashboardPayments = lazy(() => import("./pages/dashboard/Payments"));
const DashboardSettings = lazy(() => import("./pages/dashboard/Settings"));

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
    ],
  },
  { path: "/vault/new", element: <VaultNew /> },
  { path: "/vault/:id", element: <AuditRoom /> },
  { path: "/playground", element: <Playground /> },
  { path: "/v/:token", element: <ClientPortal /> },
  { path: "/v/:token/files", element: <ClientFiles /> },
  { path: "/console", element: <Console /> },
  { path: "/demo", element: <Demo /> },
  /* the client dashboard: a guarded shell with one area per route */
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <DashboardOverview /> },
      { path: "vaults", element: <DashboardVaults /> },
      { path: "ledger", element: <DashboardLedger /> },
      { path: "payments", element: <DashboardPayments /> },
      { path: "settings", element: <DashboardSettings /> },
    ],
  },
  { path: "*", element: <p className="wrap" style={{ paddingBlock: "var(--s-20)" }}>Nothing here. <a href="/">The instrument is over here.</a></p> },
];

const router = createBrowserRouter([{ element: <Shell />, children: routes }]);

export default function App() {
  return <RouterProvider router={router} />;
}

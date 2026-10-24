import { lazy, Suspense } from "react";
import { RouterProvider, createBrowserRouter, Outlet, RouteObject } from "react-router-dom";

const Landing = lazy(() => import("./pages/Landing"));
const VaultNew = lazy(() => import("./pages/VaultNew"));
const VaultDetail = lazy(() => import("./pages/VaultDetail"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientFiles = lazy(() => import("./pages/ClientFiles"));
const Console = lazy(() => import("./pages/Console"));
const Demo = lazy(() => import("./pages/Demo"));

const Fallback = () => <p role="status" style={{ padding: "var(--s-8)" }}>Loading…</p>;

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
  { path: "/", element: <Landing /> },
  { path: "/vault/new", element: <VaultNew /> },
  { path: "/vault/:id", element: <VaultDetail /> },
  { path: "/v/:token", element: <ClientPortal /> },
  { path: "/v/:token/files", element: <ClientFiles /> },
  { path: "/console", element: <Console /> },
  { path: "/demo", element: <Demo /> },
  /* placeholders so the hero CTAs land somewhere real; the forms come later */
  {
    path: "/signup",
    element: (
      <p className="wrap" style={{ paddingBlock: "var(--s-20)" }} data-testid="signup-placeholder">
        Sign up. The account form is not built yet.
      </p>
    ),
  },
  {
    path: "/signin",
    element: (
      <p className="wrap" style={{ paddingBlock: "var(--s-20)" }} data-testid="signin-placeholder">
        Sign in. The login form is not built yet.
      </p>
    ),
  },
  { path: "*", element: <p className="wrap" style={{ paddingBlock: "var(--s-20)" }}>Nothing here. <a href="/">The instrument is over here.</a></p> },
];

const router = createBrowserRouter([{ element: <Shell />, children: routes }]);

export default function App() {
  return <RouterProvider router={router} />;
}

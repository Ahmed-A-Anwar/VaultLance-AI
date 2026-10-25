import { lazy, Suspense } from "react";
import { RouterProvider, createBrowserRouter, Outlet, RouteObject } from "react-router-dom";
import VaultLayout from "./layouts/VaultLayout";

const Landing = lazy(() => import("./pages/Landing"));
const Signup = lazy(() => import("./pages/Signup"));
const Signin = lazy(() => import("./pages/Signin"));
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
  { path: "/vault/:id", element: <VaultDetail /> },
  { path: "/v/:token", element: <ClientPortal /> },
  { path: "/v/:token/files", element: <ClientFiles /> },
  { path: "/console", element: <Console /> },
  { path: "/demo", element: <Demo /> },
  /* placeholder so a successful mock sign-in lands somewhere real */
  {
    path: "/dashboard",
    element: (
      <main id="main" className="wrap" style={{ paddingBlock: "var(--s-20)" }} data-testid="dashboard">
        <h1>Dashboard</h1>
      </main>
    ),
  },
  { path: "*", element: <p className="wrap" style={{ paddingBlock: "var(--s-20)" }}>Nothing here. <a href="/">The instrument is over here.</a></p> },
];

const router = createBrowserRouter([{ element: <Shell />, children: routes }]);

export default function App() {
  return <RouterProvider router={router} />;
}

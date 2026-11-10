import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo";           // display + body: one family, two registers
import "@fontsource-variable/archivo/wdth.css";  // expanded axis for the display face
import "./styles/hero-fonts.css";                // hero faces, preloaded in index.html
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/app.css";
import "./styles/components.css";
import "./styles/landing.css";
import "./styles/pages.css";
import "./styles/hero-tokens.css";
import "./styles/hero.css";
import "./styles/signup.css";
import "./styles/playground.css";
import "./styles/refine.css";
import "./styles/laws-audit.css";
import App from "./App";
import { StoreProvider } from "./lib/store";
import { MorphProvider } from "./lib/transitions";

/* Start the two direct-entry route chunks beside the shell instead of after the
   router resolves them. React.lazy dedupes with these imports, so the route
   still owns the component; this only removes a chunk waterfall. */
const directPath = location.pathname;
if (directPath.startsWith("/dashboard/settings")) {
  void import("./pages/dashboard/DashboardLayout");
  void import("./pages/dashboard/settings/SettingsPage");
} else if (directPath.startsWith("/vault/") && directPath !== "/vault/new") {
  void import("./pages/vault/AuditRoom");
}

const root = createRoot(document.getElementById("root")!);

function mount() {
  root.render(
    <StrictMode>
      <StoreProvider>
        <MorphProvider>
          <App />
        </MorphProvider>
      </StoreProvider>
    </StrictMode>
  );
}

/* Phones paint the prerendered landing copy first. Two frames guarantee the
   browser has actually painted it before React's first commit removes the
   shell; otherwise a fast bundle can replace it before the LCP entry exists. */
const waitForPrerender =
  location.pathname === "/" && window.matchMedia("(max-width: 767px)").matches;
if (waitForPrerender) requestAnimationFrame(() => requestAnimationFrame(mount));
else mount();

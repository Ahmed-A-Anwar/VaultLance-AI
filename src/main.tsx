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
import App from "./App";
import { StoreProvider } from "./lib/store";
import { MorphProvider } from "./lib/transitions";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <MorphProvider>
        <App />
      </MorphProvider>
    </StoreProvider>
  </StrictMode>
);

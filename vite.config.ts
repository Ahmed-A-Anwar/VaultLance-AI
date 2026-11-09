import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { HeroCopy } from "./src/components/HeroCopy";

const HEADLINE = "Freelancers deliver. Clients verify. Money moves fairly.";

/* The landing copy is the LCP element. Render it once at build time into the
   mobile shell so a phone can paint it before the React bundle arrives. The
   shell is removed after React commits; it is not a second page or a second
   route, just the first paint of the same component. */
function landingCopy() {
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: "/" },
      createElement(
        "div",
        { className: "hero-page" },
        createElement(
          "div",
          { className: "hero-shell" },
          createElement(
            "div",
            { className: "hero-layout" },
            createElement(HeroCopy, {
              headline: HEADLINE,
              signupHref: "/signup",
              signinHref: "/signin",
              headlineRef: createRef<HTMLHeadingElement>(),
              bodyRef: createRef<HTMLParagraphElement>(),
              ctaBlockRef: createRef<HTMLDivElement>(),
              buttonsRef: createRef<HTMLDivElement>(),
              signupRef: createRef<HTMLAnchorElement>(),
              signinRef: createRef<HTMLAnchorElement>(),
            })
          )
        )
      )
    )
  );
}

const prerenderLanding = {
  name: "prerender-landing-copy",
  transformIndexHtml(html: string) {
    return html.replace("<!--landing-copy-->", landingCopy());
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), prerenderLanding],
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  build: { sourcemap: false, target: "es2022" },
});

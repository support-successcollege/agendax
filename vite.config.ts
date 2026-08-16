// Explicit Vite config — replaces @lovable.dev/vite-tanstack-config.
//
// Target: a fully static site on GitHub Pages.
//   - every public route is prerendered to real HTML at build time (SEO),
//   - an SPA shell is emitted for the client-only routes (/admin, /auth, ...),
//   - there is no server at runtime; privileged work lives in Supabase Edge
//     Functions, so nitro/SSR output is deliberately not produced.
import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import { collectPrerenderPages } from "./scripts/collect-pages.ts";

const SITE_HOST = process.env["SITE_URL"] ?? "https://yznews.store";

// GitHub Pages serves a project site under /<repo>/ unless a custom domain is
// used. BASE_PATH lets CI switch between the two without touching the config.
const BASE_PATH = process.env["BASE_PATH"] ?? "/";

// Routes that must never reach a crawler: they are admin-only or auth-only and
// render nothing meaningful without a session.
const CLIENT_ONLY = ["/admin", "/auth", "/reset-password", "/courses/account"];

// crawlLinks yields paths that still carry a query string ("/courses/account?
// redirect=..."), so compare on the pathname alone or admin links slip through.
const isClientOnly = (path: string) => {
  const pathname = path.split("?")[0]!.replace(/\/$/, "") || "/";
  return CLIENT_ONLY.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};

export default defineConfig(async ({ mode, command }) => {
  // Vite only injects VITE_* into import.meta.env after config resolution, but
  // collectPrerenderPages runs during it — load them up front.
  const env = loadEnv(mode, process.cwd(), "VITE_");

  const pages =
    command === "build" ? await collectPrerenderPages(env) : [];

  return {
    base: BASE_PATH,
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Server code must never be reachable from the client graph — on a
        // static host a leaked *.server.ts would ship secrets to the browser.
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/*.server.ts", "**/server/**"],
            specifiers: ["server-only"],
          },
        },
        pages,
        prerender: {
          enabled: true,
          // Every link found on a rendered page is prerendered too, which picks
          // up category links and pagination without listing them by hand.
          crawlLinks: true,
          // /article/foo -> article/foo/index.html, which is what GitHub Pages
          // needs to serve extension-less URLs.
          autoSubfolderIndex: true,
          failOnError: false,
          concurrency: 4,
          filter: ({ path }) => !isClientOnly(path),
        },
        // SPA shell mode is deliberately off: it rewrites "/" into a data-less
        // shell and no real index.html is emitted, which would cost the homepage
        // its prerendered content. postbuild copies index.html to 404.html
        // instead, which is what gives GitHub Pages its SPA fallback.
        sitemap: { enabled: true, host: SITE_HOST },
      }),
      viteReact(),
    ],
  };
});

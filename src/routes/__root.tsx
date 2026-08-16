import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AccessibilityWidget from "@/components/AccessibilityWidget";
import FloatingSocials from "@/components/FloatingSocials";
import PageViewTracker from "@/components/PageViewTracker";
import { reportLovableError } from "@/lib/lovable-error-reporting";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "YZ NEWS | חדשות משוקי ההון , מניות, וול סטריט ודוחות כספיים" },
      {
        name: "description",
        content:
          "העדכונים החמים ביותר משוקי הההון, ניתוח מניות מובילות, אירועי מאקרו-כלכלה בארה\"ב ודיווחים שוטפים מהבורסות האמריקאיות. כל הדיווחים שחשובים למשקיעים במקום אחד.",
      },
      { name: "google-site-verification", content: "dngVRAfNgIAWjQb7weDfwod_hMlikFCR0yA_ovFN0JM" },
      { name: "author", content: "Lovable" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "he_IL" },
      { property: "og:site_name", content: "YZ News" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://cmduasmuprlntbhgldlc.supabase.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://cmduasmuprlntbhgldlc.supabase.co" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap",
      },
    ],
    scripts: [
      {
        // Google AdSense - deferred until after page load to improve TTI/LCP (ported from index.html)
        children:
          "window.addEventListener('load', function() { var s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous'; s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2472621584944709'; document.head.appendChild(s); });",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[99999] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
          >
            דלג לתוכן הראשי
          </a>
          <Outlet />
          <PageViewTracker />
          <AccessibilityWidget />
          <FloatingSocials />
        </TooltipProvider>
      </QueryClientProvider>
  );
}

function NotFoundComponent() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6 text-center">
      <h1 className="text-5xl font-extrabold mb-4">404</h1>
      <p className="text-muted-foreground mb-6">הדף שחיפשת לא נמצא</p>
      <a href="/" className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold">
        חזרה לדף הבית
      </a>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6 text-center">
      <h1 className="text-2xl font-bold mb-2">הדף לא נטען</h1>
      <p className="text-muted-foreground mb-6">משהו השתבש אצלנו. אפשר לנסות שוב או לחזור לדף הבית.</p>
      <div className="flex gap-3">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold"
        >
          נסה שוב
        </button>
        <a href="/" className="px-5 py-2.5 rounded-md border border-border bg-card text-foreground font-semibold">
          לדף הבית
        </a>
      </div>
    </div>
  );
}

import { useEffect } from "react";

/**
 * The site's AdSense publisher id. The same id is in the
 * google-adsense-account meta tag (src/routes/__root.tsx) and in
 * public/ads.txt - all three have to agree.
 */
export const ADSENSE_CLIENT = "ca-pub-1429645771074558";

/**
 * The one switch for ads on the site. Turned on while the site was still in
 * review, so that ads start on their own the moment Google approves it; until
 * then the script loads and serves nothing. Set to false to take the script
 * off every page.
 */
const ADSENSE_ENABLED = true;

const SCRIPT_ID = "adsense-loader";

/** Local development is not an audience and must not request ads. */
const isLocalHost = () =>
  import.meta.env.DEV ||
  /^(localhost|127\.0\.0\.1|\[::1\])$|\.local$/.test(window.location.hostname);

/**
 * Loads the AdSense script after the page is up, never from the static head.
 *
 * The script adds its own elements to <body>. From the head it did that before
 * React had hydrated, React found markup it had not rendered, and hydration
 * failed on every page. An effect only runs once hydration has committed, and
 * waiting for the load event and an idle moment on top of that keeps the
 * script out of the way of the first paint.
 */
const AdSenseLoader = () => {
  useEffect(() => {
    if (!ADSENSE_ENABLED) return;
    if (isLocalHost()) return;
    // The panel is not a place for ads. This only covers landing on it; a
    // visitor who reaches the panel from a public page already has the script.
    if (window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/quick")) return;
    if (document.getElementById(SCRIPT_ID)) return;

    let cancelled = false;
    let idleHandle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const inject = () => {
      if (cancelled || document.getElementById(SCRIPT_ID)) return;
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    };

    const whenIdle = () => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(inject, { timeout: 3000 });
      } else {
        // Safari has no requestIdleCallback.
        timer = setTimeout(inject, 1);
      }
    };

    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
      if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return null;
};

export default AdSenseLoader;

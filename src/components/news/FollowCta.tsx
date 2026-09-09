import {
  DEFAULT_SOCIAL_LINKS,
  SOCIAL_PLATFORMS,
  useSocialLinks,
  type SocialPlatform,
} from "@/hooks/useSocialLinks";

/** The three places a reader can follow the site from the end of a story. In display order. */
const FOLLOW_CHANNELS: SocialPlatform[] = ["whatsapp", "facebook", "linkedin"];

declare global {
  interface Window {
    /** gtag.js bootstrap from the root route; absent when the tag is blocked. */
    gtag?: (...args: unknown[]) => void;
  }
}

const trackFollowClick = (channel: SocialPlatform) => {
  if (typeof window === "undefined" || typeof window.gtag !== "function")
    return;
  window.gtag("event", "follow_click", { channel });
};

/**
 * The follow prompt under a story. The URLs are the same site_settings row
 * the footer and the floating rail read, so changing an account in the panel
 * changes this block too.
 */
const FollowCta = () => {
  const { data } = useSocialLinks();
  const links = data ?? DEFAULT_SOCIAL_LINKS;

  const channels = FOLLOW_CHANNELS.flatMap((key) => {
    const platform = SOCIAL_PLATFORMS.find((entry) => entry.key === key);
    const link = links[key];
    if (!platform || !link.enabled || !/^https?:\/\/\S+$/i.test(link.url))
      return [];
    return [{ ...platform, url: link.url }];
  });

  if (channels.length === 0) return null;

  return (
    <section
      className="max-w-4xl mx-auto mt-10 border-y border-border py-6"
      aria-label="עקבו אחרי Agendax"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[19px] font-black leading-tight text-foreground">
            רוצה להישאר מעודכן?
          </h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            הכתבות החדשות של Agendax, ישר לערוץ שנוח לך.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {channels.map(({ key, label, Icon, bg, url }) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackFollowClick(key)}
              className={`${bg} inline-flex items-center gap-2 px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 transition-opacity`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FollowCta;

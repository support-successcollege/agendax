import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Facebook, Instagram, Linkedin, Twitter, Youtube, MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The social buttons the site shows — the footer row and the floating rail —
 * are editable in the panel rather than compiled in, so changing an account
 * (or hiding one) is a save, not a deploy. They live in site_settings under
 * `social_links`: public read, admin write, same as every other site setting.
 */
export type SocialPlatform =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "x"
  | "youtube"
  | "whatsapp"
  | "telegram";

export interface SocialLink {
  url: string;
  enabled: boolean;
}

export type SocialLinksMap = Record<SocialPlatform, SocialLink>;

export const SETTINGS_KEY = "social_links";

/** Display order, labels, brand colour and icon — the one list both the site and the editor read. */
export const SOCIAL_PLATFORMS: {
  key: SocialPlatform;
  label: string;
  Icon: typeof Facebook;
  /** Tailwind class for the floating button's brand colour. */
  bg: string;
  placeholder: string;
}[] = [
  { key: "linkedin", label: "לינקדאין", Icon: Linkedin, bg: "bg-[#0A66C2]", placeholder: "https://www.linkedin.com/company/..." },
  { key: "instagram", label: "אינסטגרם", Icon: Instagram, bg: "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]", placeholder: "https://www.instagram.com/..." },
  { key: "facebook", label: "פייסבוק", Icon: Facebook, bg: "bg-[#1877F2]", placeholder: "https://www.facebook.com/..." },
  { key: "x", label: "X (טוויטר)", Icon: Twitter, bg: "bg-black", placeholder: "https://x.com/..." },
  { key: "youtube", label: "יוטיוב", Icon: Youtube, bg: "bg-[#FF0000]", placeholder: "https://www.youtube.com/@..." },
  { key: "whatsapp", label: "ערוץ וואטסאפ", Icon: MessageCircle, bg: "bg-[#25D366]", placeholder: "https://whatsapp.com/channel/..." },
  { key: "telegram", label: "טלגרם", Icon: Send, bg: "bg-[#229ED9]", placeholder: "https://t.me/..." },
];

/**
 * What the site showed before the links became editable. Also the fallback
 * when the setting row is missing, so a fresh database still renders the
 * right buttons instead of none.
 */
export const DEFAULT_SOCIAL_LINKS: SocialLinksMap = {
  linkedin: { url: "https://www.linkedin.com/in/agendax-80012a42b", enabled: true },
  instagram: { url: "https://www.instagram.com/agendax.co.il", enabled: true },
  facebook: { url: "https://www.facebook.com/profile.php?id=61593402242220", enabled: true },
  x: { url: "https://x.com/agendaxcoil", enabled: true },
  youtube: { url: "", enabled: false },
  whatsapp: { url: "", enabled: false },
  telegram: { url: "", enabled: false },
};

/** Fills in any platform the stored value does not mention. */
export function normalizeSocialLinks(raw: unknown): SocialLinksMap {
  const stored = (raw ?? {}) as Partial<Record<SocialPlatform, Partial<SocialLink>>>;
  const out = {} as SocialLinksMap;
  for (const { key } of SOCIAL_PLATFORMS) {
    const fallback = DEFAULT_SOCIAL_LINKS[key];
    const value = stored[key];
    out[key] = {
      url: typeof value?.url === "string" ? value.url.trim() : fallback.url,
      enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
    };
  }
  return out;
}

export const socialLinksQueryKey = ["social-links"] as const;

async function fetchSocialLinks(): Promise<SocialLinksMap> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  return normalizeSocialLinks(data?.value);
}

/** The raw map, for the panel's editor. */
export const useSocialLinks = () =>
  useQuery({
    queryKey: socialLinksQueryKey,
    queryFn: fetchSocialLinks,
    staleTime: 10 * 60 * 1000,
    // placeholderData, not initialData: initialData counts as a fresh cache
    // entry, so with a staleTime the query would never fetch and the site
    // would keep showing the compiled-in defaults forever.
    placeholderData: DEFAULT_SOCIAL_LINKS,
  });

/** Only what the site should actually render: enabled, with a real URL, in display order. */
export const useVisibleSocialLinks = () => {
  const { data } = useSocialLinks();
  const links = data ?? DEFAULT_SOCIAL_LINKS;
  return SOCIAL_PLATFORMS.map((platform) => ({ ...platform, url: links[platform.key].url })).filter(
    (platform) => links[platform.key].enabled && /^https?:\/\/\S+$/i.test(platform.url),
  );
};

export const useRefreshSocialLinks = () => {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: socialLinksQueryKey });
};

export async function saveSocialLinks(links: SocialLinksMap) {
  const { error } = await supabase
    .from("site_settings")
    .upsert(
      // The generated Json type does not accept a named interface, only its
      // structural equivalent — a round-trip through JSON gives exactly that.
      { key: SETTINGS_KEY, value: JSON.parse(JSON.stringify(links)), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
}

import { useVisibleSocialLinks } from "@/hooks/useSocialLinks";

/** The rail of account buttons; which ones appear is set in the panel. */
const FloatingSocials = () => {
  const socials = useVisibleSocialLinks();
  if (socials.length === 0) return null;

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col gap-3">
      {socials.map(({ key, label, Icon, bg, url }) => (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={`${bg} text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform`}
        >
          <Icon className="w-5 h-5" />
        </a>
      ))}
    </div>
  );
};

export default FloatingSocials;

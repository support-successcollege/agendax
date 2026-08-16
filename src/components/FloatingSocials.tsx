import { Facebook, Instagram, MessageCircle } from "lucide-react";

const socials = [
  {
    icon: Facebook,
    href: "https://www.facebook.com/profile.php?id=61571437427607",
    label: "Facebook",
    bg: "bg-[#1877F2]",
  },
  {
    icon: Instagram,
    href: "https://www.instagram.com/yz.news/",
    label: "Instagram",
    bg: "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  {
    icon: MessageCircle,
    href: "https://whatsapp.com/channel/0029VbCBikc0VycOcGG0z42w",
    label: "ערוץ המשקיעים בווצאפ",
    bg: "bg-[#25D366]",
  },
];

const FloatingSocials = () => {
  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3">
      {socials.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          className={`${s.bg} text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform`}
        >
          <s.icon className="w-5 h-5" />
        </a>
      ))}
    </div>
  );
};

export default FloatingSocials;

import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react";

const socials = [
  {
    icon: Linkedin,
    href: "https://www.linkedin.com/in/agendax-80012a42b",
    label: "LinkedIn",
    bg: "bg-[#0A66C2]",
  },
  {
    icon: Instagram,
    href: "https://www.instagram.com/agendax.co.il",
    label: "Instagram",
    bg: "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  {
    icon: Facebook,
    href: "https://www.facebook.com/profile.php?id=61593402242220",
    label: "Facebook",
    bg: "bg-[#1877F2]",
  },
  {
    icon: Twitter,
    href: "https://x.com/agendaxcoil",
    label: "X (טוויטר)",
    bg: "bg-black",
  },
];

const FloatingSocials = () => {
  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col gap-3">
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

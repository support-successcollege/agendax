import { Facebook, Instagram, MessageCircle, Mail } from "lucide-react";
import { Link } from "@/lib/router-compat";
import wordmark from "@/assets/agendax-wordmark-light.png";

const SOCIALS = [
  {
    href: "https://www.facebook.com/profile.php?id=61571437427607",
    label: "Facebook",
    Icon: Facebook,
  },
  { href: "https://www.instagram.com/yz.news/", label: "Instagram", Icon: Instagram },
  {
    href: "https://whatsapp.com/channel/0029VbCBikc0VycOcGG0z42w",
    label: "WhatsApp",
    Icon: MessageCircle,
  },
];

const Footer = () => (
  <footer className="bg-primary text-primary-foreground mt-16" role="contentinfo">
    {/* Mirrors the hairline under the header, closing the page with the same mark. */}
    <div className="h-0.5 bg-gradient-brand" aria-hidden="true" />

    <div className="container py-12">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <img src={wordmark} alt="Agendax" width={800} height={107} className="h-7 w-auto mb-5" />
          <p className="text-primary-foreground/70 text-sm leading-relaxed mb-6 max-w-md">
            Agendax מסקר את עולם החדשנות — הייטק, בינה מלאכותית, שוקי ההון והחברות
            שמובילות את השוק. סיקור שוטף, ניתוח מעמיק, וההקשר שמאחורי הכותרת.
          </p>
          <div className="flex items-center gap-3">
            {SOCIALS.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="p-2.5 bg-primary-foreground/10 rounded-lg hover:bg-brand-blue transition-colors"
              >
                <Icon className="w-4.5 h-4.5" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-bold mb-4 text-sm">קישורים</h4>
          <ul className="space-y-2.5 text-primary-foreground/70 text-sm">
            <li><Link to="/about" className="hover:text-primary-foreground transition-colors">אודות</Link></li>
            <li><Link to="/privacy" className="hover:text-primary-foreground transition-colors">מדיניות פרטיות</Link></li>
            <li><Link to="/terms" className="hover:text-primary-foreground transition-colors">תנאי שימוש</Link></li>
            <li><Link to="/accessibility" className="hover:text-primary-foreground transition-colors">הצהרת נגישות</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-4 text-sm">צור קשר</h4>
          <ul className="space-y-3 text-primary-foreground/70 text-sm">
            <li>
              <a
                href="mailto:yzyns44@gmail.com"
                className="flex items-center gap-2 hover:text-primary-foreground transition-colors"
              >
                <Mail className="w-4 h-4 shrink-0" />
                yzyns44@gmail.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10 mt-10 pt-8 text-center text-primary-foreground/50 text-sm">
        {/* Doubles as the unadvertised way into the admin login. */}
        <button
          onClick={() => { window.location.href = "/auth"; }}
          className="hover:text-primary-foreground transition-colors cursor-pointer"
        >
          © {new Date().getFullYear()} Agendax. כל הזכויות שמורות.
        </button>
      </div>
    </div>
  </footer>
);

export default Footer;

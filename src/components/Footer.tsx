import { Facebook, Instagram, Linkedin, Twitter, Mail } from "lucide-react";
import { Link } from "@/lib/router-compat";
import wordmark from "@/assets/agendax-wordmark-light.png";

const SOCIALS = [
  {
    href: "https://www.linkedin.com/in/agendax-80012a42b",
    label: "LinkedIn",
    Icon: Linkedin,
  },
  { href: "https://www.instagram.com/agendax.co.il", label: "Instagram", Icon: Instagram },
  {
    href: "https://www.facebook.com/profile.php?id=61593402242220",
    label: "Facebook",
    Icon: Facebook,
  },
  { href: "https://x.com/agendaxcoil", label: "X (טוויטר)", Icon: Twitter },
];

const Footer = () => (
  <footer className="bg-surface-deep text-foreground mt-16 border-t border-border" role="contentinfo">
    {/* Mirrors the hairline under the header, closing the page with the same mark. */}
    <div className="h-0.5 bg-gradient-brand" aria-hidden="true" />

    <div className="container py-12">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <img src={wordmark} alt="Agendax" width={800} height={107} className="h-7 w-auto mb-5" />
          <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-md">
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
                className="p-2.5 bg-surface-2 rounded-lg hover:bg-brand-blue press transition-colors"
              >
                <Icon className="w-4.5 h-4.5" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-bold mb-4 text-sm">קישורים</h4>
          <ul className="space-y-2.5 text-muted-foreground text-sm">
            <li><Link to="/about" className="hover:text-foreground transition-colors">אודות</Link></li>
            <li><Link to="/privacy" className="hover:text-foreground transition-colors">מדיניות פרטיות</Link></li>
            <li><Link to="/terms" className="hover:text-foreground transition-colors">תנאי שימוש</Link></li>
            <li><Link to="/accessibility" className="hover:text-foreground transition-colors">הצהרת נגישות</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-4 text-sm">צור קשר</h4>
          <ul className="space-y-3 text-muted-foreground text-sm">
            <li>
              <a
                href="mailto:info@agendax.co.il"
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Mail className="w-4 h-4 shrink-0" />
                {/* An email address is a single LTR run. Left to the RTL
                    paragraph direction, bidi moves the local part to the far
                    side and it reads "@agendax.co.il ... info". */}
                <span dir="ltr">info@agendax.co.il</span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border mt-10 pt-8 text-center text-muted-foreground/60 text-sm">
        {/* Doubles as the unadvertised way into the admin login. */}
        <button
          onClick={() => { window.location.href = "/auth"; }}
          className="hover:text-foreground transition-colors cursor-pointer"
        >
          © {new Date().getFullYear()} Agendax. כל הזכויות שמורות.
        </button>
      </div>
    </div>
  </footer>
);

export default Footer;

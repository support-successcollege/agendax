import { Facebook, Instagram, MessageCircle, Mail, Phone } from "lucide-react";
import logo from "@/assets/logo.png";
const Footer = () => {
  return <footer className="bg-primary text-primary-foreground mt-16" role="contentinfo">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo & About */}
          <div className="md:col-span-2">
            
            <p className="text-primary-foreground/70 text-sm leading-relaxed mb-4">YZ News - פורטל החדשות המוביל בישראל. אנחנו מביאים לכם את החדשות החמות ביותר מעולם הטכנולוגיה, הכלכלה הפוליטיקה ושוק ההון האמריקאי, 24 שעות ביממה, 7 ימים בשבוע.</p>
            <div className="flex items-center gap-4">
              <a href="https://www.facebook.com/profile.php?id=61571437427607" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="p-2 bg-primary-foreground/10 rounded-lg hover:bg-primary-foreground/20 transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="https://www.instagram.com/yz.news/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="p-2 bg-primary-foreground/10 rounded-lg hover:bg-primary-foreground/20 transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="https://whatsapp.com/channel/0029VbCBikc0VycOcGG0z42w" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="p-2 bg-primary-foreground/10 rounded-lg hover:bg-primary-foreground/20 transition-colors">
                <MessageCircle className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-4">קישורים</h4>
            <ul className="space-y-2 text-primary-foreground/70 text-sm">
              <li><a href="/about" className="hover:text-primary-foreground transition-colors">אודות</a></li>
              <li><a href="/privacy" className="hover:text-primary-foreground transition-colors">מדיניות פרטיות</a></li>
              <li><a href="/terms" className="hover:text-primary-foreground transition-colors">תנאי שימוש</a></li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-bold mb-4">קטגוריות</h4>
            <ul className="space-y-2 text-primary-foreground/70 text-sm">
              <li><a href="/" className="hover:text-primary-foreground transition-colors">חדשות</a></li>
              <li><a href="/" className="hover:text-primary-foreground transition-colors">טכנולוגיה</a></li>
              <li><a href="/" className="hover:text-primary-foreground transition-colors">שוק ההון</a></li>
              <li><a href="/" className="hover:text-primary-foreground transition-colors">כלכלה</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold mb-4">צור קשר</h4>
            <ul className="space-y-3 text-primary-foreground/70 text-sm">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>yzyns44@gmail.com</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>{"\n"}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-primary-foreground/10 mt-8 pt-8 text-center text-primary-foreground/50 text-sm">
          <button onClick={() => window.location.href = '/auth'} className="hover:text-primary-foreground transition-colors cursor-pointer">
            © {new Date().getFullYear()} YZ News. כל הזכויות שמורות.
          </button>
        </div>
      </div>
    </footer>;
};
export default Footer;
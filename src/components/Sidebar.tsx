import { useState, useEffect, useRef } from "react";
import { Article } from "@/hooks/useArticles";
import { Loader2, CheckCircle, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSidebarWidgets, SidebarWidget } from "@/hooks/useSidebarWidgets";
import WidgetRotating from "@/components/WidgetRotating";
import { useServerFn } from "@tanstack/react-start";
import { sendAdminNotification } from "@/lib/admin.functions";

interface SidebarProps {
  articles: Article[];
  rotatingWidgets?: SidebarWidget[];
}

const StockHeatmap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.height = "400px";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    widgetContainer.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      dataSource: "SPX500",
      blockSize: "market_cap_basic",
      blockColor: "change",
      grouping: "sector",
      locale: "en",
      symbolUrl: "",
      colorTheme: "dark",
      exchanges: [],
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: "100%",
    });

    widgetContainer.appendChild(script);
    containerRef.current.appendChild(widgetContainer);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, []);

  return (
    <div className="bg-card rounded-xl p-4 shadow-card overflow-hidden">
      <h3 className="font-bold text-lg text-foreground mb-3">מפת חום - S&P 500</h3>
      <div ref={containerRef} style={{ height: "400px" }} dir="ltr" />
    </div>
  );
};

const MarketOverview = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.height = "660px";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    widgetContainer.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: "dark",
      dateRange: "12M",
      showChart: true,
      locale: "he_IL",
      largeChartUrl: "",
      isTransparent: false,
      showSymbolLogo: true,
      showFloatingTooltip: false,
      width: "100%",
      height: "100%",
      tabs: [
        {
          title: "מדדים",
          symbols: [
            { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
            { s: "FOREXCOM:NSXUSD", d: "נאסד\"ק 100" },
            { s: "FOREXCOM:DJI", d: "דאו ג'ונס" },
            { s: "INDEX:NKY", d: "ניקיי 225" },
            { s: "INDEX:DAX", d: "דאקס" },
            { s: "TASE:TA35", d: "ת\"א 35" },
          ],
          originalTitle: "Indices",
        },
        {
          title: "מט\"ח",
          symbols: [
            { s: "FX:USDILS", d: "דולר/שקל" },
            { s: "FX:EURILS", d: "אירו/שקל" },
            { s: "FX:EURUSD", d: "אירו/דולר" },
            { s: "FX:GBPUSD", d: "פאונד/דולר" },
            { s: "FX:USDJPY", d: "דולר/ין" },
          ],
          originalTitle: "Forex",
        },
        {
          title: "סחורות",
          symbols: [
            { s: "TVC:GOLD", d: "זהב" },
            { s: "TVC:SILVER", d: "כסף" },
            { s: "TVC:USOIL", d: "נפט WTI" },
            { s: "NYMEX:NG1!", d: "גז טבעי" },
          ],
          originalTitle: "Commodities",
        },
        {
          title: "קריפטו",
          symbols: [
            { s: "BITSTAMP:BTCUSD", d: "ביטקוין" },
            { s: "BITSTAMP:ETHUSD", d: "את'ריום" },
            { s: "BINANCE:SOLUSDT", d: "סולנה" },
            { s: "BINANCE:XRPUSDT", d: "ריפל" },
          ],
          originalTitle: "Crypto",
        },
      ],
    });

    widgetContainer.appendChild(script);
    containerRef.current.appendChild(widgetContainer);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, []);

  return (
    <div className="bg-card rounded-xl p-4 shadow-card overflow-hidden">
      <h3 className="font-bold text-lg text-foreground mb-3">סקירת מדדים</h3>
      <div ref={containerRef} style={{ height: "660px" }} dir="ltr" />
    </div>
  );
};

const Sidebar = ({ articles, rotatingWidgets }: SidebarProps) => {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();
  const { widgets } = useSidebarWidgets();
  const notifyAdmin = useServerFn(sendAdminNotification);

  const displayWidgets = rotatingWidgets ?? widgets.filter(w => w.isActive);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast({
        title: "שגיאה",
        description: "נא להזין כתובת מייל תקינה",
        variant: "destructive",
      });
      return;
    }

    if (!fullName.trim()) {
      toast({
        title: "שגיאה",
        description: "נא להזין שם מלא",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: newId, error } = await supabase.rpc("subscribe_newsletter", {
        p_email: email.trim(),
        p_full_name: fullName.trim(),
        p_phone: (phone.trim() || null) as unknown as string,
        p_interest_category: "כללי",
      });

      if (error) {
        if ((error as any).code === "23505" || /duplicate/i.test(error.message)) {
          toast({
            title: "כבר רשום!",
            description: "כתובת המייל הזו כבר רשומה לניוזלטר",
          });
        } else {
          throw error;
        }
      } else {
        setIsSubscribed(true);
        setEmail("");
        toast({
          title: "נרשמת בהצלחה!",
          description: "תודה שהצטרפת לניוזלטר שלנו",
        });
        if (newId) {
          notifyAdmin({ data: { type: "newsletter", recordId: newId } }).catch((e) =>
            console.error("notify failed", e)
          );
        }
      }
    } catch (error) {
      console.error("Newsletter subscription error:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן להירשם כרגע, נסו שוב מאוחר יותר",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="space-y-8">
      {/* Stock Heatmap Widget */}
      <StockHeatmap />


      {/* Newsletter */}
      <div className="bg-primary rounded-xl p-5">
        <h3 className="font-bold text-lg mb-2 text-white">הרשמו לניוזלטר</h3>
        <p className="text-sm text-white/80 mb-4">
          קבלו את החדשות החמות ביותר ישירות לתיבת המייל
        </p>
        {isSubscribed ? (
          <div className="flex items-center gap-2 text-white">
            <CheckCircle className="w-5 h-5" />
            <span>תודה שנרשמת!</span>
          </div>
        ) : !showDetails ? (
          <button
            onClick={() => setShowDetails(true)}
            className="w-full bg-accent text-white py-2.5 rounded-lg font-medium hover:bg-accent/90 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            הצטרפו עכשיו
          </button>
        ) : (
          <form onSubmit={handleNewsletterSubmit} className="space-y-3">
            <input
              type="text"
              aria-label="שם מלא"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="שם מלא *"
              className="w-full px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 placeholder:text-white/60 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-white/30"
              disabled={isLoading}
              maxLength={100}
            />
            <input
              type="email"
              aria-label="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="אימייל *"
              dir="ltr"
              className="w-full px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 placeholder:text-white/60 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-white/30"
              disabled={isLoading}
            />
            <input
              type="tel"
              aria-label="טלפון"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="טלפון (לא חובה)"
              dir="ltr"
              className="w-full px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 placeholder:text-white/60 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-white/30"
              disabled={isLoading}
              maxLength={20}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent text-white py-2 rounded-lg font-medium hover:bg-accent/90 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  נרשם...
                </>
              ) : (
                "הרשמה"
              )}
            </button>
          </form>
        )}
      </div>

      {/* Rotating CTA Widgets */}
      {displayWidgets.length > 0 && (
        <WidgetRotating widgets={displayWidgets} />
      )}
    </aside>
  );
};

export default Sidebar;

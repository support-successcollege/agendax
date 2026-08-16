import { useEffect, useRef } from "react";

const FinancialTicker = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing content
    containerRef.current.innerHTML = "";

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetContainer.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: "FX_IDC:USDILS", title: "דולר - שקל" },
        { proName: "FX_IDC:EURILS", title: "אירו - שקל" },
        { proName: "FX_IDC:GBPILS", title: "ליש\"ט - שקל" },
        { proName: "NASDAQ:NDX", title: "נאסד\"ק 100" },
        { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
        { proName: "INDEX:NKY", title: "ניקיי 225" },
        { proName: "BITSTAMP:BTCUSD", title: "ביטקוין" },
        { proName: "TVC:GOLD", title: "זהב" },
        { proName: "TVC:USOIL", title: "נפט" },
      ],
      showSymbolLogo: true,
      isTransparent: false,
      displayMode: "regular",
      colorTheme: "dark",
      locale: "he_IL",
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
    <div className="w-full overflow-hidden" dir="ltr">
      <div ref={containerRef} />
    </div>
  );
};

export default FinancialTicker;

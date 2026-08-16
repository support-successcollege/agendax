import { useEffect, useRef } from "react";

interface AdBannerProps {
  className?: string;
}

const AdBanner = ({ className = "" }: AdBannerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !containerRef.current) return;
    initialized.current = true;

    // Create script element with the exact code from Adsterra
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = "https://pl28627532.effectivegatecpm.com/769de97d56ffad934870609ca1ada172/invoke.js";
    
    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className={`relative aspect-[4/5] overflow-hidden rounded-lg bg-muted/30 flex items-center justify-center ${className}`}>
      <div 
        ref={containerRef}
        id="container-769de97d56ffad934870609ca1ada172"
        className="w-full h-full flex items-center justify-center"
      />
    </div>
  );
};

export default AdBanner;

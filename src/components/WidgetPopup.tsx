import { SidebarWidget } from "@/hooks/useSidebarWidgets";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import WidgetFormDisplay from "@/components/WidgetFormDisplay";
import { useTrackWidgetImpression, useTrackWidgetClick } from "@/hooks/useWidgetImpressions";
import { getOptimizedImageUrl } from "@/lib/imageUtils";

interface WidgetPopupProps {
  widget: SidebarWidget;
  delayMs?: number;
}

const WidgetPopup = ({ widget, delayMs = 60000 }: WidgetPopupProps) => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const pageKey = window.location.pathname.startsWith("/article/") ? "article" : "home";
    const popupKey = `widget_popup_dismissed_${widget.id}_${pageKey}`;
    const wasDismissed = sessionStorage.getItem(popupKey);
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, widget.id]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    const pageKey = window.location.pathname.startsWith("/article/") ? "article" : "home";
    sessionStorage.setItem(`widget_popup_dismissed_${widget.id}_${pageKey}`, "1");
  };

  const trackClick = useTrackWidgetClick();
  useTrackWidgetImpression(visible && !dismissed ? widget.id : null);

  if (dismissed || !visible) return null;

  const isForm = widget.actionType === "form";
  const isImage = widget.actionType === "image";

  if (isImage && widget.imageUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
        <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={handleDismiss} />
        <div className="relative max-w-md w-full animate-scale-in">
          <button
            onClick={handleDismiss}
            className="absolute top-2 left-2 sm:-top-3 sm:-left-3 z-30 bg-card rounded-full p-2.5 shadow-lg text-muted-foreground hover:text-foreground transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>

          <a
            href={widget.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackClick(widget.id);
              handleDismiss();
            }}
            className="block rounded-2xl overflow-hidden shadow-2xl"
          >
            <img src={widget.imageUrl} alt={widget.title} className="w-full h-auto block" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={handleDismiss} />

      <div className="relative bg-card rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-in">
        {widget.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-10"
            style={{ backgroundImage: `url(${getOptimizedImageUrl(widget.imageUrl, { width: 600, quality: 60 })})` }}
          />
        )}

        <button
          onClick={handleDismiss}
          className="absolute top-2 left-2 z-30 bg-muted/90 rounded-full p-2.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="סגור"
        >
          <X className="w-5 h-5" />
        </button>


        <div className="relative z-10 p-8 text-center">
          <span className="text-5xl mb-4 block">{widget.icon}</span>
          <h3 className="font-bold text-xl text-foreground mb-2">{widget.title}</h3>
          {widget.description && (
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{widget.description}</p>
          )}

          {isForm ? (
            <WidgetFormDisplay widget={widget} onClose={handleDismiss} />
          ) : (
            <a
              href={widget.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackClick(widget.id)}
              className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              {widget.buttonText}
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default WidgetPopup;

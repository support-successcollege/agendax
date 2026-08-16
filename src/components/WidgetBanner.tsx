import { SidebarWidget } from "@/hooks/useSidebarWidgets";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import WidgetFormDisplay from "@/components/WidgetFormDisplay";
import { useTrackWidgetImpression, useTrackWidgetClick } from "@/hooks/useWidgetImpressions";
import { getOptimizedImageUrl } from "@/lib/imageUtils";

interface WidgetBannerProps {
  widgets: SidebarWidget[];
  intervalMs?: number;
}

const WidgetBanner = ({ widgets, intervalMs = 10000 }: WidgetBannerProps) => {
  const [dismissed, setDismissed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (widgets.length <= 1 || showForm) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % widgets.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [widgets.length, intervalMs, showForm]);

  const currentWidget = !dismissed && widgets.length > 0 ? widgets[currentIndex] : null;
  useTrackWidgetImpression(currentWidget?.id ?? null);
  const trackClick = useTrackWidgetClick();

  if (dismissed || widgets.length === 0) return null;

  const widget = widgets[currentIndex];
  const isForm = widget.actionType === "form";
  const isImage = widget.actionType === "image";

  if (isImage && widget.imageUrl) {
    return (
      <div className="relative rounded-xl overflow-hidden shadow-card">
        <a href={widget.linkUrl} target="_blank" rel="noopener noreferrer" className="block" onClick={() => trackClick(widget.id)}>
          <img src={widget.imageUrl} alt={widget.title} className="w-full h-auto block" loading="lazy" />
        </a>
        {widgets.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {widgets.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-primary" : "bg-background/60"}`}
              />
            ))}
          </div>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 left-2 z-20 bg-background/80 rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="סגור"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-card border border-border rounded-xl overflow-hidden shadow-card">
      {widget.imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{ backgroundImage: `url(${getOptimizedImageUrl(widget.imageUrl, { width: 800, quality: 60 })})` }}
        />
      )}

      {isForm && showForm ? (
        <div className="relative z-10 p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-foreground">{widget.title}</h4>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <WidgetFormDisplay widget={widget} onClose={() => setShowForm(false)} />
        </div>
      ) : isForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="relative z-10 flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors w-full text-right"
        >
          <span className="text-2xl shrink-0">{widget.icon}</span>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-foreground text-sm truncate">{widget.title}</h4>
            {widget.description && (
              <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
            )}
          </div>
        </button>
      ) : (
        <a
          href={widget.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClick(widget.id)}
          className="relative z-10 flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors block"
        >
          <span className="text-2xl shrink-0">{widget.icon}</span>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-foreground text-sm truncate">{widget.title}</h4>
            {widget.description && (
              <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
            )}
          </div>
        </a>
      )}

      {/* Rotation dots */}
      {widgets.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2 relative z-10">
          {widgets.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-primary" : "bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 left-2 z-20 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="סגור"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default WidgetBanner;

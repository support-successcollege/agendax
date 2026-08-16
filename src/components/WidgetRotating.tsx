import { SidebarWidget } from "@/hooks/useSidebarWidgets";
import { useState, useEffect } from "react";
import WidgetFormDisplay from "@/components/WidgetFormDisplay";
import { useTrackWidgetImpression, useTrackWidgetClick } from "@/hooks/useWidgetImpressions";
import { getOptimizedImageUrl } from "@/lib/imageUtils";

interface WidgetRotatingProps {
  widgets: SidebarWidget[];
  intervalMs?: number;
}

const WidgetRotating = ({ widgets, intervalMs = 10000 }: WidgetRotatingProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (widgets.length <= 1 || showForm) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % widgets.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [widgets.length, intervalMs, showForm]);

  const currentWidget = widgets.length > 0 ? widgets[currentIndex] : null;
  useTrackWidgetImpression(currentWidget?.id ?? null);
  const trackClick = useTrackWidgetClick();

  if (widgets.length === 0) return null;

  const widget = widgets[currentIndex];
  const isForm = widget.actionType === "form";
  const isImage = widget.actionType === "image";

  if (isImage && widget.imageUrl) {
    return (
      <div className="relative animate-fade-in">
        <a
          href={widget.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClick(widget.id)}
          className="block rounded-xl overflow-hidden shadow-card hover:shadow-lg transition-all"
        >
          <img src={widget.imageUrl} alt={widget.title} className="w-full h-auto block" loading="lazy" />
        </a>
        {widgets.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {widgets.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-primary" : "bg-muted-foreground/30"}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isForm && showForm) {
    return (
      <div className="block bg-card rounded-xl p-5 shadow-card relative overflow-hidden animate-fade-in">
        {widget.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-15"
            style={{ backgroundImage: `url(${getOptimizedImageUrl(widget.imageUrl, { width: 600, quality: 60 })})` }}
          />
        )}
        <div className="relative z-10">
          <h3 className="font-bold text-lg text-foreground mb-3">{widget.icon} {widget.title}</h3>
          <WidgetFormDisplay widget={widget} onClose={() => setShowForm(false)} />
        </div>
      </div>
    );
  }

  const content = (
    <>
      {widget.imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15"
          style={{ backgroundImage: `url(${getOptimizedImageUrl(widget.imageUrl, { width: 600, quality: 60 })})` }}
        />
      )}
      <div className="relative z-10">
        <h3 className="font-bold text-lg text-foreground mb-2">{widget.icon} {widget.title}</h3>
        {widget.description && <p className="text-sm text-muted-foreground mb-3">{widget.description}</p>}
        <span className="inline-block bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors text-sm">
          {widget.buttonText}
        </span>
      </div>
      {widgets.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3 relative z-10">
          {widgets.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-primary" : "bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      )}
    </>
  );

  if (isForm) {
    return (
      <button
        key={widget.id}
        onClick={() => setShowForm(true)}
        className="block w-full bg-card rounded-xl p-5 shadow-card hover:shadow-lg transition-all text-center relative overflow-hidden animate-fade-in"
      >
        {content}
      </button>
    );
  }

  return (
    <a
      key={widget.id}
      href={widget.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackClick(widget.id)}
      className="block bg-card rounded-xl p-5 shadow-card hover:shadow-lg transition-all text-center relative overflow-hidden animate-fade-in"
    >
      {content}
    </a>
  );
};

export default WidgetRotating;

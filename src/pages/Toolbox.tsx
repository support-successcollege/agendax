import { useState } from "react";
import { useSidebarWidgets, SidebarWidget } from "@/hooks/useSidebarWidgets";
import WidgetFormDisplay from "@/components/WidgetFormDisplay";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, FileText } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/imageUtils";


const Toolbox = () => {
  const { widgets, isLoading } = useSidebarWidgets();
  const [formWidget, setFormWidget] = useState<SidebarWidget | null>(null);

  const activeWidgets = widgets.filter((w) => w.isActive && w.actionType !== "image");

  const handleWidgetClick = (widget: SidebarWidget) => {
    if (widget.actionType === "form") {
      setFormWidget(widget);
    } else if (widget.linkUrl) {
      window.open(widget.linkUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <Header />
      <main id="main-content" className="container py-8 min-h-screen" dir="rtl">
        <h1 className="text-3xl font-bold mb-8 text-foreground">🧰 ארגז הכלים</h1>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : activeWidgets.length === 0 ? (
          <p className="text-muted-foreground text-center py-20">אין כלים זמינים כרגע</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeWidgets.map((widget) => (
              <button
                key={widget.id}
                onClick={() => handleWidgetClick(widget)}
                className="relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs hover:shadow-lg transition-all duration-300 hover:scale-[1.02] group text-right p-6 flex flex-col justify-between min-h-[180px]"
              >
                {widget.imageUrl && (
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-10 group-hover:opacity-20 transition-opacity"
                    style={{ backgroundImage: `url(${getOptimizedImageUrl(widget.imageUrl, { width: 600, quality: 60 })})` }}
                  />
                )}
                <div className="relative z-10">
                  <span className="text-3xl mb-2 block">{widget.icon}</span>
                  <h2 className="text-lg font-bold text-foreground mb-1">{widget.title}</h2>
                  {widget.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{widget.description}</p>
                  )}
                </div>
                <div className="relative z-10 flex items-center gap-1 text-sm font-medium text-primary mt-2">
                  {widget.actionType === "form" ? (
                    <>
                      <FileText className="w-4 h-4" />
                      {widget.buttonText}
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      {widget.buttonText}
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
      <Footer />

      <Dialog open={!!formWidget} onOpenChange={() => setFormWidget(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{formWidget?.title}</DialogTitle>
          </DialogHeader>
          {formWidget && (
            <WidgetFormDisplay widget={formWidget} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Toolbox;

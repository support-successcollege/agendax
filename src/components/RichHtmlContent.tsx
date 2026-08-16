import { useMemo } from "react";
import WidgetBanner from "@/components/WidgetBanner";
import { useSidebarWidgets, SidebarWidget } from "@/hooks/useSidebarWidgets";

interface RichHtmlContentProps {
  content: string;
  className?: string;
  widgets?: SidebarWidget[];
}

const EMBED_RE = /<div[^>]*data-widget-id="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi;

type Segment = { type: "html"; html: string } | { type: "widget"; id: string };

export const splitWidgetEmbeds = (content: string): Segment[] => {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  EMBED_RE.lastIndex = 0;
  while ((match = EMBED_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "html", html: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "widget", id: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "html", html: content.slice(lastIndex) });
  }
  return segments;
};

/**
 * Renders rich HTML (from TipTap) and replaces any embedded widget placeholders
 * (`<div data-widget-id="...">`) with real, interactive WidgetBanner components.
 */
const RichHtmlContent = ({ content, className, widgets }: RichHtmlContentProps) => {
  const { widgets: allWidgets } = useSidebarWidgets();
  const source = widgets ?? allWidgets;
  const segments = useMemo(() => splitWidgetEmbeds(content || ""), [content]);
  const wrapperClass = className ?? "article-content max-w-none min-w-0 overflow-x-hidden leading-relaxed text-foreground/90";

  return (
    <div className={wrapperClass}>
      {segments.map((segment, i) => {
        if (segment.type === "html") {
          return <div key={i} dangerouslySetInnerHTML={{ __html: segment.html }} />;
        }
        const widget = source.find(w => w.id === segment.id && w.isActive);
        if (!widget) return null;
        return (
          <div key={i} className="my-6">
            <WidgetBanner widgets={[widget]} />
          </div>
        );
      })}
    </div>
  );
};

export default RichHtmlContent;

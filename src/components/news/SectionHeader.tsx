import { Link } from "@/lib/router-compat";
import { ChevronLeft } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  /** Where "לכל הכתבות" goes. Omitted for sections with no page of their own. */
  href?: string;
  linkLabel?: string;
  /** The category's own colour for the marker; defaults to the brand blue. */
  color?: string;
  /** Right-hand note instead of a link — a date, a count, a live tag. */
  note?: string;
}

/**
 * A section rule, the way a newspaper sets one: a solid colour marker, a heavy
 * title, a hairline running to the end of the column, and the "see all" link
 * parked at the far edge. It says "a new section starts here" without a box.
 */
const SectionHeader = ({ title, href, linkLabel = "לכל הכתבות", color, note }: SectionHeaderProps) => (
  <div className="flex items-center gap-3 border-b-2 border-border pb-1.5 mb-4">
    <span
      className="h-[18px] w-[4px] shrink-0"
      style={{ backgroundColor: color || "hsl(var(--primary))" }}
      aria-hidden="true"
    />
    <h2 className="text-[19px] font-black leading-none text-foreground">{title}</h2>
    {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
    {href && (
      <Link
        to={href}
        className="mr-auto flex items-center gap-0.5 text-[12px] font-semibold text-muted-foreground hover:text-primary transition-colors"
      >
        {linkLabel}
        <ChevronLeft className="w-3.5 h-3.5" />
      </Link>
    )}
  </div>
);

export default SectionHeader;

import { Link } from "@/lib/router-compat";
import { useAuthors } from "@/hooks/useAuthors";
import { timeLabel } from "@/lib/newsTime";
import WriterAvatar from "@/components/article/WriterAvatar";

type Props = {
  author: string;
  authorSlug: string | null | undefined;
  /** published_at when there is one, else the article's date. */
  publishedAt: string;
};

/**
 * The line under the headline: who wrote it, what they do, and when.
 *
 * The roster is small and already cached for the newsroom, so the byline looks
 * its writer up there instead of widening every article query. An unknown slug
 * (an inactive writer) still prints the name, just without the link.
 */
const Byline = ({ author, authorSlug, publishedAt }: Props) => {
  const { data: authors } = useAuthors();
  const writer = authorSlug
    ? authors?.find((a) => a.slug === authorSlug)
    : undefined;
  const name = writer?.name ?? author;
  const date = new Date(publishedAt);

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <WriterAvatar
        name={name}
        avatarUrl={writer?.avatarUrl}
        photoAlt={writer?.photoAlt || name}
        size={40}
      />
      <div className="min-w-0 leading-tight">
        <div className="flex flex-wrap items-center gap-1.5">
          {writer ? (
            <Link
              to={`/author/${writer.slug}`}
              className="text-[13.5px] font-bold text-foreground hover:text-primary transition-colors"
            >
              {name}
            </Link>
          ) : (
            <span className="text-[13.5px] font-bold text-foreground">
              {name}
            </span>
          )}
          {/* Said on the article itself, not only on the profile: a reader
              who never clicks through still knows. */}
          {writer?.kind === "ai" && (
            <Link
              to="/ai-policy"
              className="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-[1px] text-[10.5px] font-bold text-primary hover:bg-primary/20 transition-colors"
              title="נכתב על ידי סוכן AI - למדיניות המלאה"
            >
              סוכן AI
            </Link>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          {writer?.role && <span>{writer.role}</span>}
          {writer?.role && <span aria-hidden="true">·</span>}
          <time dateTime={date.toISOString()} className="tabular-nums">
            {date.toLocaleDateString("he-IL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" · "}
            {timeLabel(publishedAt)}
          </time>
        </div>
      </div>
    </div>
  );
};

export default Byline;

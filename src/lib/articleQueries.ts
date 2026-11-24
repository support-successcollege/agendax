/**
 * Small, purpose-built article queries for the public pages.
 *
 * The pages used to share one query that returned every article (capped at
 * 1000 rows by the API) and filtered it in memory. That list was embedded in
 * every prerendered page, downloaded again after hydration, and fetched once
 * per page by every build. Each query here asks the database for exactly the
 * rows one piece of the page shows.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Article } from "@/hooks/useArticles";
import { ARTICLE_LIST_COLUMNS, mapDbToArticle } from "@/lib/queries";

/**
 * The stock photo the ingest pipeline falls back to when a story has no
 * picture of its own. A card built on it looks like every other fallback
 * card, so those stories are skipped where a card needs its own image.
 */
const STOCK_FALLBACK_IMAGE = "photo-1504711434969-e33886168f5c";

const RELATED_SAME_CATEGORY = 3;

/** A row as the API returns it, before it is mapped to an Article. */
type Row = {
  id: string;
  slug?: string | null;
  title?: string | null;
  excerpt?: string | null;
};

/** The select strings are built at runtime, so the client cannot type the rows itself. */
const rowsOf = (data: unknown): Row[] =>
  Array.isArray(data) ? (data as Row[]) : [];

/** Newest first, the same order the full list used. */
const newestFirst = <
  Q extends { order: (column: string, options?: object) => Q },
>(
  query: Q,
): Q =>
  query
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

/** Live stories with a picture of their own, excluding one story. */
const relatedCandidates = (excludeId: string) =>
  supabase
    .from("articles")
    .select(ARTICLE_LIST_COLUMNS)
    .eq("is_draft", false)
    .neq("id", excludeId)
    .not("image_url", "is", null)
    .neq("image_url", "")
    .not("image_url", "ilike", `%${STOCK_FALLBACK_IMAGE}%`);

/**
 * What goes under a story: the three newest live stories from the same
 * section, then the newest live story from any other section, so the reader
 * gets both "more of this" and "what else is happening".
 */
export const relatedArticlesQueryOptions = (current: {
  id: string;
  categorySlug?: string | null;
}) =>
  queryOptions({
    queryKey: ["articles", "related", current.categorySlug ?? null, current.id],
    queryFn: async (): Promise<Article[]> => {
      const slug = current.categorySlug;
      const [same, other] = await Promise.all([
        slug
          ? newestFirst(
              relatedCandidates(current.id).eq("category_slug", slug),
            ).limit(RELATED_SAME_CATEGORY)
          : Promise.resolve({ data: [], error: null }),
        newestFirst(
          slug
            ? relatedCandidates(current.id).neq("category_slug", slug)
            : relatedCandidates(current.id),
        ).limit(1),
      ]);
      if (same.error) throw same.error;
      if (other.error) throw other.error;

      const seen = new Set<string>();
      return [...rowsOf(same.data), ...rowsOf(other.data)]
        .filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        })
        .map(mapDbToArticle);
    },
    staleTime: 60_000,
  });

/** What the search dialog shows for one hit. */
export interface ArticleSearchHit {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string;
}

export const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 10;

/**
 * Turns what the reader typed into a quoted PostgREST value for `ilike`.
 * Two layers of escaping: `%`, `_` and `\` are wildcards to LIKE, and a
 * comma, dot, parenthesis or quote would otherwise end the value inside an
 * `or=(...)` filter, so the whole pattern travels double-quoted.
 */
const ilikePattern = (term: string) => {
  const literal = term.replace(/[\\%_]/g, "\\$&");
  return `"%${literal.replace(/[\\"]/g, "\\$&")}%"`;
};

/**
 * Search by title or excerpt, newest first. Asked of the database when the
 * reader types, so no page has to carry the article list for a search that
 * most visits never open, and every published article is reachable.
 */
export const searchArticlesQueryOptions = (rawTerm: string) => {
  const term = rawTerm.trim();
  return queryOptions({
    queryKey: ["articles", "search", term.toLowerCase()],
    queryFn: async (): Promise<ArticleSearchHit[]> => {
      const pattern = ilikePattern(term);
      const { data, error } = await newestFirst(
        supabase
          .from("articles")
          .select("id, slug, title, excerpt")
          .eq("is_draft", false)
          .or(`title.ilike.${pattern},excerpt.ilike.${pattern}`),
      ).limit(SEARCH_LIMIT);
      if (error) throw error;
      return rowsOf(data).map((row) => ({
        id: row.id,
        slug: row.slug ?? null,
        title: row.title ?? "",
        excerpt: row.excerpt ?? "",
      }));
    },
    enabled: term.length >= SEARCH_MIN_LENGTH,
    staleTime: 60_000,
  });
};

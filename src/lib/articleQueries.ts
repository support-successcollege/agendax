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
  published_at?: string | null;
  created_at?: string | null;
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

/** Live stories with the columns a card needs. */
const liveArticles = () =>
  supabase.from("articles").select(ARTICLE_LIST_COLUMNS).eq("is_draft", false);

type QueryResult = { data: unknown; error: unknown };

const timeOf = (value?: string | null) => (value ? Date.parse(value) || 0 : 0);

/** The same order `newestFirst` asks the database for, for rows merged here. */
const byNewest = (a: Row, b: Row) =>
  timeOf(b.published_at) - timeOf(a.published_at) ||
  timeOf(b.created_at) - timeOf(a.created_at);

/** Merges several answers into one list: each story once, newest first. */
const mergeNewestFirst = (results: QueryResult[]): Article[] => {
  const byId = new Map<string, Row>();
  for (const result of results) {
    for (const row of rowsOf(result.data)) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort(byNewest).map(mapDbToArticle);
};

/** hero_rotation is newer than the generated database types. */
const untypedTable = (table: string) =>
  (
    supabase as unknown as {
      from: (name: string) => {
        select: (columns: string) => PromiseLike<QueryResult>;
      };
    }
  ).from(table);

type ChosenRow = { article_id?: string | null; pick_date?: string | null };

const chosenRows = (data: unknown): ChosenRow[] =>
  Array.isArray(data) ? (data as ChosenRow[]) : [];

/**
 * Stories the front page shows because someone chose them, not because they
 * are new: the week's rotation for the top slot, and the latest day of the
 * editors' picks. They can be older than anything else on the page, so they
 * are asked for by id. A failure here leaves those two blocks short; it must
 * not take the front page down, so it resolves to an empty list.
 */
const fetchChosenIds = async (): Promise<string[]> => {
  try {
    const [rotation, picks] = await Promise.all([
      untypedTable("hero_rotation").select("article_id"),
      supabase
        .from("editors_picks")
        .select("article_id, pick_date")
        .order("pick_date", { ascending: false })
        .order("rank", { ascending: true })
        .limit(24),
    ]);
    const pickRows = chosenRows(picks.data);
    const latestDay = pickRows[0]?.pick_date;
    const ids = [
      ...chosenRows(rotation.data),
      ...pickRows.filter((row) => row.pick_date === latestDay),
    ]
      .map((row) => row.article_id)
      .filter((id): id is string => !!id);
    return [...new Set(ids)];
  } catch {
    return [];
  }
};

const HOME_NEWEST = 20;
const HOME_FLAGGED = 20;
const HOME_PER_SECTION = 5;

/**
 * The sections that get a block of their own at the bottom of the front page.
 * Sorted, so the same sections always give the same query key.
 */
export const homeSectionSlugs = (
  categories: { slug: string; isActive?: boolean }[],
) =>
  categories
    .filter((c) => c.isActive && c.slug !== "home" && c.slug !== "marketing")
    .map((c) => c.slug)
    .sort();

/**
 * Everything the front page shows, and nothing else: the newest stories (the
 * top block, the strip under the header and the river), the pinned and
 * breaking ones, the stories chosen by id, and the newest few of each section.
 *
 * It comes back as one list, newest first, because the page's blocks slice it
 * by position: the first twenty are exactly the site's newest twenty, and a
 * section's first five are that section's newest five.
 */
export const homeFeedQueryOptions = (sectionSlugs: string[]) =>
  queryOptions({
    queryKey: ["articles", "home", sectionSlugs.join(",")],
    queryFn: async (): Promise<Article[]> => {
      const requests: PromiseLike<QueryResult>[] = [
        newestFirst(liveArticles()).limit(HOME_NEWEST),
        newestFirst(
          liveArticles().or("is_featured.eq.true,is_breaking.eq.true"),
        ).limit(HOME_FLAGGED),
        fetchChosenIds().then((ids): PromiseLike<QueryResult> =>
          ids.length > 0
            ? liveArticles().in("id", ids)
            : Promise.resolve({ data: [], error: null }),
        ),
        ...sectionSlugs.map((slug) =>
          newestFirst(liveArticles().eq("category_slug", slug)).limit(
            HOME_PER_SECTION,
          ),
        ),
      ];
      const results = await Promise.all(requests);
      for (const result of results) {
        if (result.error) throw result.error;
      }
      return mergeNewestFirst(results);
    },
    staleTime: 60_000,
  });

const JOIN_PREVIEW_COUNT = 5;

/**
 * The join page quotes real headlines: the newest few stories, leaving out the
 * marketing section, which is not news.
 */
export const joinPreviewQueryOptions = () =>
  queryOptions({
    queryKey: ["articles", "join-preview"],
    queryFn: async (): Promise<Article[]> => {
      const { data, error } = await newestFirst(
        liveArticles().neq("category_slug", "marketing"),
      ).limit(JOIN_PREVIEW_COUNT);
      if (error) throw error;
      return rowsOf(data).map(mapDbToArticle);
    },
    staleTime: 60_000,
  });

/**
 * How many stories were published inside a time window. The join page uses it
 * for "published today" on the reader's own clock, so the window is the
 * caller's to give and the database only counts.
 */
export const publishedCountQueryOptions = (fromIso: string, toIso: string) =>
  queryOptions({
    queryKey: ["articles", "published-count", fromIso, toIso],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("is_draft", false)
        .gte("published_at", fromIso)
        .lt("published_at", toIso);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

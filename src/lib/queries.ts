/**
 * Shared query definitions used by BOTH route loaders (SSR) and page hooks.
 * Keys here MUST match the keys used by the hooks in src/hooks/* so that a
 * loader-primed cache entry is picked up by the component without refetching.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Article } from "@/hooks/useArticles";
import type { Course } from "@/hooks/useCourses";
import type { EventItem } from "@/hooks/useEvents";
import type { Job } from "@/hooks/useJobs";

const db: any = supabase;

// Columns needed for article list views (excludes heavy `content` field).
export const ARTICLE_LIST_COLUMNS =
  "id, slug, title, excerpt, category, category_slug, date, image_url, author, is_breaking, is_featured, is_draft, scheduled_at, published_at, created_at";

/** True for a UUID-shaped article identifier (legacy /article/<uuid> links). */
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Preferred public path segment for an article: its slug, falling back to id. */
export const articleSlugOrId = (article: { slug?: string | null; id: string }) =>
  article.slug || article.id;

export const mapDbToArticle = (dbRow: any): Article => ({
  id: dbRow.id,
  slug: dbRow.slug ?? null,
  title: dbRow.title,
  excerpt: dbRow.excerpt,
  content: dbRow.content ?? "",
  category: dbRow.category,
  categorySlug: dbRow.category_slug,
  date: dbRow.date,
  imageUrl: dbRow.image_url,
  author: dbRow.author,
  isBreaking: dbRow.is_breaking ?? false,
  isFeatured: dbRow.is_featured ?? false,
  isDraft: dbRow.is_draft ?? false,
  scheduledAt: dbRow.scheduled_at ?? null,
  publishedAt: dbRow.published_at ?? null,
});

export const articlesQueryOptions = (includeContent = false) =>
  queryOptions({
    queryKey: ["articles", { includeContent }],
    queryFn: async (): Promise<Article[]> => {
      const { data, error } = await supabase
        .from("articles")
        .select(includeContent ? "*" : ARTICLE_LIST_COLUMNS)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as any[]) ?? []).map(mapDbToArticle);
    },
    staleTime: 60_000,
  });

/** Looks an article up by slug, falling back to id for legacy UUID links. */
export const articleQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ["article", idOrSlug],
    queryFn: async (): Promise<Article | null> => {
      const key = decodeURIComponent(idOrSlug);
      const column = isUuid(key) ? "id" : "slug";
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq(column, key)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDbToArticle(data) : null;
    },
    staleTime: 60_000,
  });

export const courseQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["course", slug],
    queryFn: async (): Promise<Course | null> => {
      const { data, error } = await db
        .from("courses")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Course | null;
    },
    staleTime: 60_000,
  });

export const eventQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["event", slug],
    queryFn: async (): Promise<EventItem | null> => {
      const { data, error } = await db
        .from("events")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as EventItem | null;
    },
    staleTime: 60_000,
  });

export const jobQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["job", id],
    queryFn: async (): Promise<Job | null> => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Job | null;
    },
    staleTime: 60_000,
  });

export const jobsQueryOptions = (onlyActive = false) =>
  queryOptions({
    queryKey: ["jobs", { onlyActive }],
    queryFn: async (): Promise<Job[]> => {
      let query = supabase
        .from("jobs")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (onlyActive) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as Job[]);
    },
    staleTime: 60_000,
  });

export const coursesQueryOptions = (onlyPublished = false) =>
  queryOptions({
    queryKey: ["courses", { onlyPublished }],
    queryFn: async (): Promise<Course[]> => {
      let q = db
        .from("courses")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (onlyPublished) q = q.eq("is_published", true);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Course[]);
    },
    staleTime: 60_000,
  });

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
}

export const FALLBACK_CATEGORIES: CategoryRow[] = [
  { id: "1", name: "ראשי", slug: "home", displayOrder: 0, isActive: true },
  { id: "2", name: "חדשות", slug: "news", displayOrder: 1, isActive: true },
  { id: "3", name: "טכנולוגיה", slug: "technology", displayOrder: 2, isActive: true },
  { id: "4", name: "שוק ההון", slug: "stocks", displayOrder: 3, isActive: true },
  { id: "5", name: "כלכלה", slug: "economy", displayOrder: 4, isActive: true },
  { id: "6", name: "פוליטיקה", slug: "politics", displayOrder: 5, isActive: true },
  { id: "7", name: "אקטואליה", slug: "current", displayOrder: 6, isActive: true },
];

export const categoriesQueryOptions = () =>
  queryOptions({
    queryKey: ["categories"],
    queryFn: async (): Promise<CategoryRow[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) {
        console.error("Error fetching categories:", error);
        return FALLBACK_CATEGORIES;
      }
      return (data ?? []).map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        displayOrder: cat.display_order ?? 0,
        isActive: cat.is_active ?? true,
      }));
    },
    staleTime: 5 * 60_000,
  });

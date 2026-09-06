import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A byline with a page behind it.
 *
 * Every story on the site is written by a machine, and saying so plainly is
 * what makes the byline worth anything: the reader can see which agent covers
 * which beat, what it is allowed to do, and which models write it. A profile
 * that implied a person would be worse than no profile at all.
 */
export type Author = {
  slug: string;
  name: string;
  /** 'ai' for a declared agent. Reserved for real staff bylines later. */
  kind: "ai" | "human";
  role: string;
  beat: string | null;
  bio: string;
  /** Retained from an earlier draft of the profiles; nothing renders it. */
  method: string;
  /** The one line under the bio, linking on to the AI policy. */
  modelNote: string;
  avatarUrl: string | null;
  categorySlugs: string[];
  sortOrder: number;
};

const mapDbToAuthor = (row: any): Author => ({
  slug: row.slug,
  name: row.name,
  kind: row.kind,
  role: row.role,
  beat: row.beat ?? null,
  bio: row.bio ?? "",
  method: row.method ?? "",
  modelNote: row.model_note ?? "",
  avatarUrl: row.avatar_url ?? null,
  categorySlugs: row.category_slugs ?? [],
  sortOrder: row.sort_order ?? 0,
});

const AUTHOR_COLUMNS =
  "slug, name, kind, role, beat, bio, method, model_note, avatar_url, category_slugs, sort_order";

export const fetchAuthors = async (): Promise<Author[]> => {
  const { data, error } = await supabase
    .from("authors")
    .select(AUTHOR_COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map(mapDbToAuthor);
};

export const fetchAuthor = async (slug: string): Promise<Author | null> => {
  const { data, error } = await supabase
    .from("authors")
    .select(AUTHOR_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDbToAuthor(data) : null;
};

export const useAuthors = () =>
  useQuery({ queryKey: ["authors"], queryFn: fetchAuthors, staleTime: 300_000 });

export const useAuthor = (slug: string | undefined) =>
  useQuery({
    queryKey: ["author", slug],
    queryFn: () => fetchAuthor(slug!),
    enabled: !!slug,
    staleTime: 300_000,
  });

/** Editable fields. The slug is the identity and never changes: it is the URL. */
export type AuthorDraft = Pick<
  Author,
  "name" | "role" | "beat" | "bio" | "modelNote"
> & { isActive: boolean };

export const saveAuthor = async (slug: string, draft: AuthorDraft) => {
  const { error } = await supabase
    .from("authors")
    .update({
      name: draft.name.trim(),
      role: draft.role.trim(),
      beat: draft.beat?.trim() || null,
      bio: draft.bio.trim(),
      model_note: draft.modelNote.trim(),
      is_active: draft.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);
  if (error) throw error;
};

/**
 * The panel edits the roster including inactive agents, which the public
 * `fetchAuthors` deliberately hides.
 */
export const fetchAllAuthors = async (): Promise<(Author & { isActive: boolean })[]> => {
  const { data, error } = await supabase
    .from("authors")
    .select(`${AUTHOR_COLUMNS}, is_active`)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map((row) => ({
    ...mapDbToAuthor(row),
    isActive: row.is_active,
  }));
};

export const useAllAuthors = () =>
  useQuery({ queryKey: ["authors", "all"], queryFn: fetchAllAuthors, staleTime: 30_000 });

export const useRefreshAuthors = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["authors"] });
    queryClient.invalidateQueries({ queryKey: ["author"] });
  };
};

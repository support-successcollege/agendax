import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db: any = supabase;

/**
 * A byline with a page behind it.
 *
 * Two kinds of writer share one roster:
 *  - 'human'  a real staff writer. Marked up as a schema.org Person.
 *  - 'system' the newsroom byline, "חדשות AgendaX", for stories that belong to
 *             no single writer. Every article has an author, so this is where
 *             the rest land, including everything the pipeline writes.
 */
export type AuthorKind = "human" | "system";

export type Author = {
  slug: string;
  name: string;
  kind: AuthorKind;
  role: string;
  beat: string | null;
  bio: string;
  avatarUrl: string | null;
  /** Alt text for the photo. Empty means the photo is decorative. */
  photoAlt: string;
  sortOrder: number;
};

export const ROLE_MAX = 60;
export const BIO_MAX = 400;
/** The newsroom byline. It cannot be deleted: it is where orphans go. */
export const SYSTEM_AUTHOR_SLUG = "agendax";

const SITE_URL = "https://agendax.co.il";

/** Avatars are either site-relative (/authors/eden.svg) or a Storage URL. */
export const absoluteAvatarUrl = (url: string | null) =>
  !url ? undefined : /^https?:\/\//.test(url) ? url : `${SITE_URL}${url}`;

/** "עדן כהן" → "עכ". Shown in the circle when a writer has no photo. */
export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

/**
 * Mirrors public.author_slug_base(): Hebrew and Latin letters and digits stay,
 * everything else collapses to one hyphen. Used only to preview the URL in the
 * panel; the database makes the real slug and adds -1, -2 on a clash.
 */
export const slugPreview = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/g, "-")
    .replace(/^-+|-+$/g, "") || "writer";

const mapDbToAuthor = (row: any): Author => ({
  slug: row.slug,
  name: row.name,
  kind: row.kind,
  role: row.role,
  beat: row.beat ?? null,
  bio: row.bio ?? "",
  avatarUrl: row.avatar_url ?? null,
  photoAlt: row.photo_alt ?? "",
  sortOrder: row.sort_order ?? 0,
});

const AUTHOR_COLUMNS =
  "slug, name, kind, role, beat, bio, avatar_url, photo_alt, sort_order";

export const fetchAuthors = async (): Promise<Author[]> => {
  const { data, error } = await db
    .from("authors")
    .select(AUTHOR_COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map(mapDbToAuthor);
};

export const fetchAuthor = async (slug: string): Promise<Author | null> => {
  const { data, error } = await db
    .from("authors")
    .select(AUTHOR_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDbToAuthor(data) : null;
};

export const useAuthors = () =>
  useQuery({
    queryKey: ["authors"],
    queryFn: fetchAuthors,
    staleTime: 300_000,
  });

export const useAuthor = (slug: string | undefined) =>
  useQuery({
    queryKey: ["author", slug],
    queryFn: () => fetchAuthor(slug!),
    enabled: !!slug,
    staleTime: 300_000,
  });

/** Editable fields. The slug is the identity and never changes: it is the URL. */
export type AuthorDraft = {
  name: string;
  kind: AuthorKind;
  role: string;
  beat: string | null;
  bio: string;
  avatarUrl: string | null;
  photoAlt: string;
  isActive: boolean;
};

export const emptyDraft = (): AuthorDraft => ({
  name: "",
  kind: "human",
  role: "",
  beat: null,
  bio: "",
  avatarUrl: null,
  photoAlt: "",
  isActive: true,
});

export const draftFromAuthor = (author: AdminAuthor): AuthorDraft => ({
  name: author.name,
  kind: author.kind,
  role: author.role,
  beat: author.beat,
  bio: author.bio,
  avatarUrl: author.avatarUrl,
  photoAlt: author.photoAlt,
  isActive: author.isActive,
});

/** Returns the first problem with a draft, or null when it can be saved. */
export const validateDraft = (draft: AuthorDraft): string | null => {
  if (!draft.name.trim()) return "שם הכתב הוא שדה חובה";
  if (!draft.role.trim()) return "תפקיד הוא שדה חובה";
  if (draft.role.trim().length > ROLE_MAX) return `תפקיד עד ${ROLE_MAX} תווים`;
  if (draft.bio.trim().length > BIO_MAX) return `ביוגרפיה עד ${BIO_MAX} תווים`;
  if (draft.avatarUrl && !draft.photoAlt.trim()) return "חסר טקסט חלופי לתמונה";
  return null;
};

const toRow = (draft: AuthorDraft) => ({
  name: draft.name.trim(),
  kind: draft.kind,
  role: draft.role.trim(),
  beat: draft.beat?.trim() || null,
  bio: draft.bio.trim(),
  avatar_url: draft.avatarUrl,
  photo_alt: draft.photoAlt.trim() || null,
  is_active: draft.isActive,
  updated_at: new Date().toISOString(),
});

export const saveAuthor = async (slug: string, draft: AuthorDraft) => {
  const { error } = await db
    .from("authors")
    .update(toRow(draft))
    .eq("slug", slug);
  if (error) throw error;
};

/** Flips the active switch without touching the rest of the profile. */
export const setAuthorActive = async (slug: string, isActive: boolean) => {
  const { error } = await db
    .from("authors")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) throw error;
};

/** Inserts a writer. The database picks the slug from the name. */
export const createAuthor = async (draft: AuthorDraft): Promise<string> => {
  const { data: last } = await db
    .from("authors")
    .select("sort_order")
    .neq("slug", SYSTEM_AUTHOR_SLUG)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await db
    .from("authors")
    .insert({ ...toRow(draft), sort_order: (last?.sort_order ?? 0) + 1 })
    .select("slug")
    .single();
  if (error) throw error;
  return data.slug as string;
};

/** Deletes a writer with no articles. One with articles goes through reassign. */
export const deleteAuthor = async (slug: string) => {
  const { error } = await db.from("authors").delete().eq("slug", slug);
  if (error) throw error;
};

/** Moves every article of `from` to `to`, then deletes `from`. Returns the count moved. */
export const reassignAndDeleteAuthor = async (
  from: string,
  to: string,
): Promise<number> => {
  const { data, error } = await db.rpc("reassign_and_delete_author", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data as number) ?? 0;
};

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;

/** Uploads a profile photo to the public article-images bucket. */
export const uploadAuthorPhoto = async (file: File): Promise<string> => {
  if (!PHOTO_TYPES.includes(file.type))
    throw new Error("JPG, PNG או WEBP בלבד");
  if (file.size > PHOTO_MAX_BYTES) throw new Error("התמונה גדולה מ-3MB");
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `writers/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("article-images")
    .upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });
  if (error) throw error;
  return supabase.storage.from("article-images").getPublicUrl(path).data
    .publicUrl;
};

export type AdminAuthor = Author & {
  isActive: boolean;
  publishedCount: number;
  totalCount: number;
};

/**
 * The panel edits the roster including inactive writers, which the public
 * `fetchAuthors` deliberately hides.
 */
export const fetchAllAuthors = async (): Promise<AdminAuthor[]> => {
  const [{ data, error }, { data: counts, error: countError }] =
    await Promise.all([
      db
        .from("authors")
        .select(`${AUTHOR_COLUMNS}, is_active`)
        .order("sort_order", { ascending: true }),
      db
        .from("author_article_counts")
        .select("slug, published_count, total_count"),
    ]);
  if (error) throw error;
  if (countError) throw countError;
  const bySlug = new Map<string, any>(
    ((counts as any[]) ?? []).map((c) => [c.slug, c]),
  );
  return ((data as any[]) ?? []).map((row) => ({
    ...mapDbToAuthor(row),
    isActive: row.is_active,
    publishedCount: Number(bySlug.get(row.slug)?.published_count ?? 0),
    totalCount: Number(bySlug.get(row.slug)?.total_count ?? 0),
  }));
};

export const useAllAuthors = () =>
  useQuery({
    queryKey: ["authors", "all"],
    queryFn: fetchAllAuthors,
    staleTime: 30_000,
  });

export const useRefreshAuthors = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["authors"] });
    queryClient.invalidateQueries({ queryKey: ["author"] });
    queryClient.invalidateQueries({ queryKey: ["articles"] });
  };
};

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { articlesQueryOptions, articleQueryOptions, ARTICLE_LIST_COLUMNS } from "@/lib/queries";

// Columns needed for article list views (excludes heavy `content` field).
const LIST_COLUMNS = ARTICLE_LIST_COLUMNS;


export interface Article {
  id: string;
  /** URL-friendly Hebrew slug built from the title; null for legacy rows. */
  slug?: string | null;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  categorySlug: string;
  date: string;
  imageUrl: string;
  author: string;
  isBreaking?: boolean;
  isFeatured?: boolean;
  isDraft?: boolean;
  scheduledAt?: string | null;
  publishedAt?: string | null;
}

interface DbArticle {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  category_slug: string;
  date: string;
  image_url: string;
  author: string;
  is_breaking: boolean | null;
  is_featured: boolean | null;
  is_draft: boolean | null;
  scheduled_at: string | null;
  published_at: string | null;
}

const mapDbToArticle = (db: Partial<DbArticle> & { id: string; title: string; excerpt: string; category: string; category_slug: string; date: string; image_url: string; author: string }): Article => ({
  id: db.id,
  slug: db.slug ?? null,
  title: db.title,
  excerpt: db.excerpt,
  content: db.content ?? "",
  category: db.category,
  categorySlug: db.category_slug,
  date: db.date,
  imageUrl: db.image_url,
  author: db.author,
  isBreaking: db.is_breaking ?? false,
  isFeatured: db.is_featured ?? false,
  isDraft: db.is_draft ?? false,
  scheduledAt: db.scheduled_at,
  publishedAt: db.published_at,
});

const mapArticleToDb = (article: Omit<Article, "id">) => ({
  title: article.title,
  excerpt: article.excerpt,
  content: article.content,
  category: article.category,
  category_slug: article.categorySlug,
  date: article.date,
  image_url: article.imageUrl,
  author: article.author,
  is_breaking: article.isBreaking ?? false,
  is_featured: article.isFeatured ?? false,
  is_draft: article.isDraft ?? false,
  scheduled_at: article.scheduledAt ?? null,
});

export const useArticles = (options: { includeContent?: boolean } = {}) => {
  const { includeContent = false } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const listOptions = articlesQueryOptions(includeContent);

  const {
    data: articles = [],
    isLoading,
    refetch,
  } = useQuery(listOptions);

  // Local cache writer so mutations keep the existing optimistic behaviour
  // while the source of truth stays in the React Query cache (which is what
  // the SSR loaders prime).
  const setArticles = (updater: (prev: Article[]) => Article[]) => {
    queryClient.setQueryData<Article[]>(listOptions.queryKey, (prev) =>
      updater(prev ?? []),
    );
  };


  const addArticle = async (article: Omit<Article, "id">): Promise<Article | null> => {
    try {
      // If the article is being created as published (not a draft and not scheduled
      // for the future), stamp `published_at` with now so it appears at the top of
      // the feed by actual publish time.
      const insertData: any = mapArticleToDb(article);
      const isImmediatelyPublished =
        !article.isDraft &&
        (!article.scheduledAt || new Date(article.scheduledAt) <= new Date());
      if (isImmediatelyPublished && !insertData.published_at) {
        insertData.published_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("articles")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      const newArticle = mapDbToArticle(data as DbArticle);
      setArticles((prev) => [newArticle, ...prev]);
      
      toast({
        title: "הכתבה נוספה בהצלחה",
        description: "הכתבה פורסמה באתר",
      });

      return newArticle;
    } catch (error) {
      console.error("Error adding article:", error);
      toast({
        title: "שגיאה בהוספת כתבה",
        description: "לא ניתן להוסיף את הכתבה",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateArticle = async (article: Article): Promise<boolean> => {
    try {
      const updateData: any = mapArticleToDb(article);

      // If the article is being moved out of draft (published manually) and we
      // don't yet have a `published_at`, stamp it now so it surfaces at the top
      // of the feed by actual publish time, not by creation time.
      const isNowPublished =
        !article.isDraft &&
        (!article.scheduledAt || new Date(article.scheduledAt) <= new Date());
      if (isNowPublished && !article.publishedAt) {
        updateData.published_at = new Date().toISOString();
      } else if (article.publishedAt) {
        updateData.published_at = article.publishedAt;
      }

      const { error } = await supabase
        .from("articles")
        .update(updateData)
        .eq("id", article.id);

      if (error) throw error;

      const updatedArticle = {
        ...article,
        publishedAt: updateData.published_at ?? article.publishedAt ?? null,
      };
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? updatedArticle : a))
      );

      toast({
        title: "הכתבה עודכנה",
        description: "השינויים נשמרו בהצלחה",
      });

      return true;
    } catch (error) {
      console.error("Error updating article:", error);
      toast({
        title: "שגיאה בעדכון כתבה",
        description: "לא ניתן לעדכן את הכתבה",
        variant: "destructive",
      });
      return false;
    }
  };

  const bumpArticle = async (id: string): Promise<boolean> => {
    try {
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const { error } = await supabase
        .from("articles")
        .update({ published_at: nowIso, date: today, is_draft: false, scheduled_at: null })
        .eq("id", id);

      if (error) throw error;

      setArticles((prev) =>
        [...prev]
          .map((a) =>
            a.id === id
              ? { ...a, publishedAt: nowIso, date: today, isDraft: false, scheduledAt: null }
              : a
          )
          .sort((a, b) =>
            (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")
          )
      );

      toast({
        title: "הכתבה הוקפצה לראש",
        description: "הכתבה תופיע כעת בראש האתר",
      });

      return true;
    } catch (error) {
      console.error("Error bumping article:", error);
      toast({
        title: "שגיאה בהקפצת הכתבה",
        description: "לא ניתן להקפיץ את הכתבה",
        variant: "destructive",
      });
      return false;
    }
  };

  const deleteArticle = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from("articles").delete().eq("id", id);

      if (error) throw error;

      setArticles((prev) => prev.filter((a) => a.id !== id));

      toast({
        title: "הכתבה נמחקה",
        description: "הכתבה הוסרה בהצלחה",
      });

      return true;
    } catch (error) {
      console.error("Error deleting article:", error);
      toast({
        title: "שגיאה במחיקת כתבה",
        description: "לא ניתן למחוק את הכתבה",
        variant: "destructive",
      });
      return false;
    }
  };
  return {
    articles,
    isLoading,
    addArticle,
    updateArticle,
    bumpArticle,
    deleteArticle,
    refetch,
  };

};


export const getArticlesByCategory = (articles: Article[], categorySlug: string) => {
  if (categorySlug === "home") return articles;
  return articles.filter((article) => article.categorySlug === categorySlug);
};

export const getFeaturedArticle = (articles: Article[]) => {
  return articles.find((article) => article.isFeatured) || articles[0];
};

export const getBreakingNews = (articles: Article[]) => {
  return articles.filter((article) => article.isBreaking);
};

export const getArticleById = (articles: Article[], id: string) => {
  return articles.find((article) => article.id === id);
};

// Fetch a single article (with full content) by ID. Used by the article page
// to avoid downloading every article's content just to render one.
export const useArticle = (id: string | undefined) => {
  const { data: article, isLoading, error } = useQuery({
    ...articleQueryOptions(id ?? ""),
    enabled: !!id,
  });


  return { article: article ?? undefined, isLoading, error };
};

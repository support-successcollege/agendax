import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sendAdminNotification } from "@/lib/admin.functions";

export interface Comment {
  id: string;
  article_id: string;
  author_name: string;
  author_email: string | null;
  content: string;
  is_approved: boolean;
  created_at: string;
  approved_at: string | null;
  // Joined from articles table
  article_title?: string;
}

// Get approved comments for an article (public)
export const useArticleComments = (articleId: string | undefined) => {
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["articleComments", articleId],
    queryFn: async (): Promise<Comment[]> => {
      if (!articleId) return [];

      // Use secure RPC function that excludes author_email from public results
      const { data, error } = await supabase
        .rpc("get_approved_comments", { p_article_id: articleId });

      if (error) {
        console.error("Error fetching comments:", error);
        return [];
      }

      return (data || []) as Comment[];
    },
    enabled: !!articleId,
  });

  return { comments, isLoading };
};

// Submit a new comment (public)
export const useSubmitComment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const notifyAdmin = sendAdminNotification;

  return useMutation({
    mutationFn: async ({
      articleId,
      authorName,
      authorEmail,
      content,
    }: {
      articleId: string;
      authorName: string;
      authorEmail?: string;
      content: string;
    }) => {
      const { data: newId, error } = await supabase.rpc("submit_pending_comment", {
        p_article_id: articleId,
        p_author_name: authorName,
        p_author_email: (authorEmail || null) as unknown as string,
        p_content: content,
      });

      if (error) throw error;

      if (newId) {
        notifyAdmin({ data: { type: "pending_comment", recordId: newId } }).catch((e) =>
          console.error("notify failed", e)
        );
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: "התגובה נשלחה בהצלחה",
        description: "התגובה תפורסם לאחר אישור המערכת",
      });
      queryClient.invalidateQueries({ queryKey: ["articleComments", variables.articleId] });
    },
    onError: (error) => {
      console.error("Error submitting comment:", error);
      toast({
        title: "שגיאה בשליחת התגובה",
        description: "אנא נסה שוב מאוחר יותר",
        variant: "destructive",
      });
    },
  });
};

// Admin: Get all pending comments
export const usePendingComments = () => {
  const { data: comments = [], isLoading, refetch } = useQuery({
    queryKey: ["pendingComments"],
    queryFn: async (): Promise<Comment[]> => {
      // First get pending comments
      const { data: commentsData, error: commentsError } = await supabase
        .from("article_comments")
        .select("*")
        .eq("is_approved", false)
        .order("created_at", { ascending: false });

      if (commentsError) {
        console.error("Error fetching pending comments:", commentsError);
        return [];
      }

      if (!commentsData || commentsData.length === 0) return [];

      // Get article titles
      const articleIds = [...new Set(commentsData.map((c) => c.article_id))];
      const { data: articlesData } = await supabase
        .from("articles")
        .select("id, title")
        .in("id", articleIds);

      const articleTitles: Record<string, string> = {};
      articlesData?.forEach((a) => {
        articleTitles[a.id] = a.title;
      });

      return commentsData.map((c) => ({
        ...c,
        article_title: articleTitles[c.article_id] || "כתבה לא נמצאה",
      }));
    },
    refetchInterval: 30000,
  });

  return { comments, isLoading, refetch };
};

// Admin: Approve a comment
export const useApproveComment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from("article_comments")
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .eq("id", commentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "התגובה אושרה",
        description: "התגובה פורסמה בהצלחה",
      });
      queryClient.invalidateQueries({ queryKey: ["pendingComments"] });
    },
    onError: (error) => {
      console.error("Error approving comment:", error);
      toast({
        title: "שגיאה באישור התגובה",
        variant: "destructive",
      });
    },
  });
};

// Admin: Delete a comment
export const useDeleteComment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from("article_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "התגובה נמחקה",
      });
      queryClient.invalidateQueries({ queryKey: ["pendingComments"] });
    },
    onError: (error) => {
      console.error("Error deleting comment:", error);
      toast({
        title: "שגיאה במחיקת התגובה",
        variant: "destructive",
      });
    },
  });
};

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

// Robust UUID (fallback for older Safari / restricted contexts)
const genUUID = (): string => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  // RFC4122-ish fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Generate or get session ID for anonymous reactions, with in-memory fallback
let memorySessionId: string | null = null;
const getSessionId = (): string => {
  const key = "article_session_id";
  try {
    let sessionId = localStorage.getItem(key);
    if (!sessionId) {
      sessionId = genUUID();
      localStorage.setItem(key, sessionId);
    }
    return sessionId;
  } catch {
    // localStorage blocked (private mode, cookies disabled) — fall back to memory
    if (!memorySessionId) memorySessionId = genUUID();
    return memorySessionId;
  }
};

export interface ReactionCounts {
  likes: number;
  dislikes: number;
}

export const useArticleReactions = (articleId: string | undefined) => {
  const queryClient = useQueryClient();
  const [sessionId] = useState(() => getSessionId());

  const { data: counts = { likes: 0, dislikes: 0 }, isLoading: isLoadingCounts } = useQuery({
    queryKey: ["articleReactions", articleId],
    queryFn: async (): Promise<ReactionCounts> => {
      if (!articleId) return { likes: 0, dislikes: 0 };
      const { data, error } = await supabase.rpc("get_article_reaction_counts", {
        p_article_id: articleId,
      });
      if (error) {
        console.error("Error fetching reactions:", error);
        return { likes: 0, dislikes: 0 };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        likes: Number(row?.likes ?? 0),
        dislikes: Number(row?.dislikes ?? 0),
      };
    },
    enabled: !!articleId,
  });

  const { data: userReaction, isLoading: isLoadingUserReaction } = useQuery({
    queryKey: ["userReaction", articleId, sessionId],
    queryFn: async (): Promise<"like" | "dislike" | null> => {
      if (!articleId) return null;
      const { data, error } = await supabase.rpc("get_user_article_reaction", {
        p_article_id: articleId,
        p_session_id: sessionId,
      });
      if (error) {
        console.error("Error fetching user reaction:", error);
        return null;
      }
      return (data as "like" | "dislike" | null) || null;
    },
    enabled: !!articleId,
  });

  const reactMutation = useMutation({
    mutationFn: async (reactionType: "like" | "dislike") => {
      if (!articleId) throw new Error("No article ID");
      const { data, error } = await supabase.rpc("toggle_article_reaction", {
        p_article_id: articleId,
        p_session_id: sessionId,
        p_reaction_type: reactionType,
      });
      if (error) throw error;
      return (data as "like" | "dislike" | null) ?? null;
    },
    // Optimistic update — instant visual feedback for the guest
    onMutate: async (reactionType) => {
      await queryClient.cancelQueries({ queryKey: ["articleReactions", articleId] });
      await queryClient.cancelQueries({ queryKey: ["userReaction", articleId, sessionId] });
      const prevCounts = queryClient.getQueryData<ReactionCounts>(["articleReactions", articleId]) ?? { likes: 0, dislikes: 0 };
      const prevUser = queryClient.getQueryData<"like" | "dislike" | null>(["userReaction", articleId, sessionId]) ?? null;

      let nextLikes = prevCounts.likes;
      let nextDislikes = prevCounts.dislikes;
      let nextUser: "like" | "dislike" | null = reactionType;

      if (prevUser === reactionType) {
        // toggling off
        if (reactionType === "like") nextLikes = Math.max(0, nextLikes - 1);
        else nextDislikes = Math.max(0, nextDislikes - 1);
        nextUser = null;
      } else {
        // switching or first-time
        if (prevUser === "like") nextLikes = Math.max(0, nextLikes - 1);
        if (prevUser === "dislike") nextDislikes = Math.max(0, nextDislikes - 1);
        if (reactionType === "like") nextLikes += 1;
        else nextDislikes += 1;
      }

      queryClient.setQueryData(["articleReactions", articleId], { likes: nextLikes, dislikes: nextDislikes });
      queryClient.setQueryData(["userReaction", articleId, sessionId], nextUser);
      return { prevCounts, prevUser };
    },
    onError: (err: any, _vars, ctx) => {
      console.error("Reaction failed:", err);
      if (ctx) {
        queryClient.setQueryData(["articleReactions", articleId], ctx.prevCounts);
        queryClient.setQueryData(["userReaction", articleId, sessionId], ctx.prevUser);
      }
      toast({
        title: "לא הצלחנו לשמור את התגובה",
        description: err?.message || "נסה שוב עוד רגע",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["articleReactions", articleId] });
      queryClient.invalidateQueries({ queryKey: ["userReaction", articleId, sessionId] });
    },
  });

  return {
    counts,
    userReaction,
    isLoading: isLoadingCounts || isLoadingUserReaction,
    react: reactMutation.mutate,
    isReacting: reactMutation.isPending,
  };
};

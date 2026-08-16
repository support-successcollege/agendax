import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArticleReactions } from "@/hooks/useReactions";
import { cn } from "@/lib/utils";

interface ArticleReactionsProps {
  articleId: string;
}

const ArticleReactions = ({ articleId }: ArticleReactionsProps) => {
  const { counts, userReaction, react, isReacting } = useArticleReactions(articleId);

  return (
    <div className="flex items-center gap-4 py-6 border-t border-b" dir="rtl">
      <span className="text-sm text-muted-foreground">האם אהבת את הכתבה?</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => react("like")}
          disabled={isReacting}
          className={cn(
            "gap-2 transition-colors",
            userReaction === "like" && "bg-green-100 border-green-500 text-green-700 hover:bg-green-200"
          )}
        >
          <ThumbsUp className={cn("w-4 h-4", userReaction === "like" && "fill-current")} />
          <span>{counts.likes}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => react("dislike")}
          disabled={isReacting}
          className={cn(
            "gap-2 transition-colors",
            userReaction === "dislike" && "bg-red-100 border-red-500 text-red-700 hover:bg-red-200"
          )}
        >
          <ThumbsDown className={cn("w-4 h-4", userReaction === "dislike" && "fill-current")} />
          <span>{counts.dislikes}</span>
        </Button>
      </div>
    </div>
  );
};

export default ArticleReactions;

import { useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { useArticles } from "@/hooks/useArticles";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SearchDialog = ({ open, onOpenChange }: SearchDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const { articles } = useArticles();
  const navigate = useNavigate();

  // Filter only published articles
  const publishedArticles = articles.filter(article => !article.isDraft);

  // Search in title and excerpt
  const searchResults = searchQuery.trim()
    ? publishedArticles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleArticleClick = (idOrSlug: string) => {
    onOpenChange(false);
    setSearchQuery("");
    navigate(`/article/${encodeURIComponent(idOrSlug)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-right">חיפוש כתבות</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="חיפוש כתבות"
            placeholder="הקלד לחיפוש..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 text-right"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="נקה חיפוש"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {searchQuery.trim() && (
          <div className="mt-4 max-h-[300px] overflow-y-auto">
            {searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.slice(0, 10).map((article) => (
                  <button
                    key={article.id}
                    onClick={() => handleArticleClick(article.slug || article.id)}
                    className="w-full text-right p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <p className="font-medium line-clamp-1">{article.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {article.excerpt}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                לא נמצאו תוצאות עבור "{searchQuery}"
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SearchDialog;

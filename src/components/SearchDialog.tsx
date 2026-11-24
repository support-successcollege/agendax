import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import {
  SEARCH_MIN_LENGTH,
  searchArticlesQueryOptions,
} from "@/lib/articleQueries";
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

/** How long the reader has to stop typing before the search is sent. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Article search. This dialog sits in the header of every page, and it used to
 * load the whole article list on every page view so that it could filter it
 * in memory if someone opened it. It now asks the database only while the
 * reader is typing, which also reaches every published article instead of the
 * newest thousand.
 */
const SearchDialog = ({ open, onOpenChange }: SearchDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [term, setTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(
      () => setTerm(searchQuery.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchOptions = searchArticlesQueryOptions(term);
  const {
    data: searchResults = [],
    isFetching,
    isError,
  } = useQuery({
    ...searchOptions,
    enabled: open && term.length >= SEARCH_MIN_LENGTH,
    // Keep the previous hits on screen while the next ones load, so the list
    // does not blink empty between keystrokes.
    placeholderData: keepPreviousData,
  });

  const typed = searchQuery.trim();
  const tooShort = typed.length > 0 && typed.length < SEARCH_MIN_LENGTH;
  // True from the keystroke until the answer for that exact text is in.
  const waiting = typed !== term || isFetching;

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

        {typed && (
          <div
            className="mt-4 max-h-[300px] overflow-y-auto"
            aria-live="polite"
          >
            {tooShort ? (
              <p className="text-center text-muted-foreground py-8">
                הקלידו לפחות {SEARCH_MIN_LENGTH} תווים
              </p>
            ) : isError ? (
              <p className="text-center text-muted-foreground py-8">
                החיפוש לא זמין כרגע. נסו שוב בעוד רגע.
              </p>
            ) : searchResults.length > 0 ? (
              <div className={`space-y-2${waiting ? " opacity-60" : ""}`}>
                {searchResults.map((article) => (
                  <button
                    key={article.id}
                    onClick={() =>
                      handleArticleClick(article.slug || article.id)
                    }
                    className="w-full text-right p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <p className="font-medium line-clamp-1">{article.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {article.excerpt}
                    </p>
                  </button>
                ))}
              </div>
            ) : waiting ? (
              <p className="text-center text-muted-foreground py-8">מחפש...</p>
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

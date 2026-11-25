import { useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Article } from "@/data/articles";

interface AIArticleGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Unused. The old generator handed its text to the panel's article form; the
   * quick production page saves its own draft. Kept so the panel compiles
   * without a change to Admin.tsx.
   */
  onArticleGenerated: (article: Article) => void;
}

/**
 * The panel's "generate an article" buttons now open the quick production
 * page (/quick), which replaced the dialog that used to live here: it reads
 * the sources in full, has a reviewer check the draft against them, and takes
 * the article all the way to the site and the social networks.
 *
 * This stays a component, not a link, because three buttons in Admin.tsx open
 * it through one `open` flag.
 */
const AIArticleGenerator = ({
  open,
  onOpenChange,
}: AIArticleGeneratorProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    // Reset the flag first, so coming back to the panel does not bounce the
    // editor straight to /quick again.
    onOpenChange(false);
    navigate("/quick");
  }, [open, onOpenChange, navigate]);

  return null;
};

export default AIArticleGenerator;

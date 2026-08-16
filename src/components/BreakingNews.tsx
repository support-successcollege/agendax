import { AlertCircle } from "lucide-react";
import { Article, getBreakingNews } from "@/hooks/useArticles";
import { motion } from "framer-motion";
import { Link } from "@/lib/router-compat";

interface BreakingNewsProps {
  articles: Article[];
}

const BreakingNews = ({ articles }: BreakingNewsProps) => {
  const breakingNews = getBreakingNews(articles);

  if (breakingNews.length === 0) return null;

  return (
    <div className="bg-gradient-breaking text-accent-foreground">
      <div className="container py-3">
        <div className="flex items-center gap-4">
          <motion.div 
            className="flex items-center gap-2 shrink-0"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-bold text-sm">מבזקים</span>
          </motion.div>
          <div className="overflow-hidden">
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="whitespace-nowrap"
            >
              {breakingNews.map((news, index) => (
                <Link key={news.id} to={`/article/${encodeURIComponent(news.slug || news.id)}`} className="mx-8 hover:underline">
                  {news.title}
                  {index < breakingNews.length - 1 && " • "}
                </Link>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BreakingNews;

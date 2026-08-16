import { useState } from "react";
import { Article } from "@/hooks/useArticles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Star, Zap, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface AdminHighlightsTabProps {
  articles: Article[];
  onUpdateArticle: (article: Article) => Promise<boolean>;
}

const AdminHighlightsTab = ({ articles, onUpdateArticle }: AdminHighlightsTabProps) => {
  const [search, setSearch] = useState("");
  const publishedArticles = articles.filter(a => !a.isDraft);

  const filteredArticles = search
    ? publishedArticles.filter(a => a.title.includes(search))
    : publishedArticles;

  const breakingArticles = publishedArticles.filter(a => a.isBreaking);
  const featuredArticle = publishedArticles.find(a => a.isFeatured);

  const toggleBreaking = async (article: Article) => {
    await onUpdateArticle({ ...article, isBreaking: !article.isBreaking });
  };

  const toggleFeatured = async (article: Article) => {
    // If setting as featured, unset the current featured first
    if (!article.isFeatured && featuredArticle) {
      await onUpdateArticle({ ...featuredArticle, isFeatured: false });
    }
    await onUpdateArticle({ ...article, isFeatured: !article.isFeatured });
  };

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              כתבה מובילה
            </CardTitle>
          </CardHeader>
          <CardContent>
            {featuredArticle ? (
              <div className="flex items-center gap-3">
                <img src={featuredArticle.imageUrl} alt="" className="w-14 h-14 object-cover rounded-lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{featuredArticle.title}</p>
                  <p className="text-xs text-muted-foreground">{featuredArticle.category}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">לא נבחרה כתבה מובילה</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              כתבות בזק פעילות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {breakingArticles.length > 0 ? (
              <div className="space-y-2">
                {breakingArticles.map(a => (
                  <div key={a.id} className="flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-accent shrink-0" />
                    <p className="text-sm truncate">{a.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">אין כתבות בזק פעילות</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Article List */}
      <Card>
        <CardHeader>
          <CardTitle>ניהול כתבות בזק וכתבה מובילה</CardTitle>
          <CardDescription>סמנו כתבות כ"בזק" או בחרו כתבה מובילה לדף הבית</CardDescription>
          <div className="relative mt-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש כתבה..."
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredArticles.map(article => (
              <div
                key={article.id}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <img
                  src={article.imageUrl}
                  alt=""
                  className="w-16 h-16 object-cover rounded-lg shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{article.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{article.category}</span>
                    <span className="text-xs text-muted-foreground">{article.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <Switch
                      checked={article.isBreaking ?? false}
                      onCheckedChange={() => toggleBreaking(article)}
                    />
                    <span className="text-xs text-muted-foreground">בזק</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant={article.isFeatured ? "default" : "outline"}
                      size="sm"
                      className="gap-1 h-7 text-xs"
                      onClick={() => toggleFeatured(article)}
                    >
                      <Star className="w-3 h-3" />
                      {article.isFeatured ? "מובילה" : "בחר"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filteredArticles.length === 0 && (
              <p className="text-center text-muted-foreground py-8">לא נמצאו כתבות</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminHighlightsTab;

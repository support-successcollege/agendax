import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import wordmark from "@/assets/agendax-wordmark-light.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Article } from "@/hooks/useArticles";
import { useArticles } from "@/hooks/useArticles";
import { useCategories, Category } from "@/hooks/useCategories";
import { useTodayViewCount, useTodayNewArticles, useAllArticleViews, usePeriodViewCount, useTopPages, usePathNames, useVisitorStats, getRangeBounds, type ViewRangePreset } from "@/hooks/usePageViews";
import ArticleEditDialog from "@/components/ArticleEditDialog";
import ArticleCreateDialog from "@/components/ArticleCreateDialog";
import AIArticleGenerator from "@/components/AIArticleGenerator";
import SocialPostGenerator from "@/components/SocialPostGenerator";
import WhatsAppPostGenerator from "@/components/WhatsAppPostGenerator";
import PostImageGenerator from "@/components/PostImageGenerator";
import ArticleQualityBadge from "@/components/ArticleQualityBadge";
import AdminCommentsTab from "@/components/AdminCommentsTab";
import AdminHighlightsTab from "@/components/AdminHighlightsTab";
import AdminWidgetsTab from "@/components/AdminWidgetsTab";
import AdminNewsletterTab from "@/components/AdminNewsletterTab";
import AdminGlobalIngestTab from "@/components/AdminGlobalIngestTab";
import ArticleStatsDialog from "@/components/ArticleStatsDialog";
import ArticleExportImport from "@/components/ArticleExportImport";
import AdminArticleCalendar from "@/components/AdminArticleCalendar";
import AdminAIAdvice from "@/components/AdminAIAdvice";
import AdminBackup from "@/components/AdminBackup";

import { usePendingComments } from "@/hooks/useComments";
import { 
  LogOut, 
  Newspaper, 
  Users, 
  BarChart3, 
  Settings, 
  Plus,
  Edit,
  Trash2,
  Home,
  Sparkles,
  Loader2,
  PenLine,
  Eye,
  Zap,
  Clock,
  Share2,
  Calendar,
  TrendingUp,
  Globe,
  Search,
  ArrowUp
} from "lucide-react";

import { MessageCircle, LayoutGrid, ImageIcon } from "lucide-react";
import { User } from "@supabase/supabase-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { submitSitemap } from "@/lib/admin.functions";
import { invokeEdge } from "@/lib/edge";
import { useQueryClient } from "@tanstack/react-query";

const SitemapSubmitCard = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; submittedAt: string } | null>(null);
  const { toast } = useToast();
  const submitSitemapFn = submitSitemap;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const data = await submitSitemapFn();
      setLastResult({ success: data.success, submittedAt: data.submittedAt });
      toast({
        title: data.success ? "הוגש בהצלחה!" : "הגשה חלקית",
        description: data.success ? "מפות האתר הוגשו לגוגל בהצלחה" : "חלק מהמפות לא הוגשו בהצלחה",
        variant: data.success ? "default" : "destructive",
      });
    } catch (err) {
      toast({ title: "שגיאה", description: "לא ניתן היה להגיש את מפות האתר", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          הגשת Sitemap לגוגל
        </CardTitle>
        <CardDescription>הגש את מפות האתר ל-Google Search Console לשיפור האינדוקס</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          {isSubmitting ? "מגיש..." : "הגש עכשיו"}
        </Button>
        {lastResult && (
          <span className="text-sm text-muted-foreground">
            הגשה אחרונה: {new Date(lastResult.submittedAt).toLocaleString("he-IL")} — {lastResult.success ? "✅ הצלחה" : "❌ כשלון"}
          </span>
        )}
      </CardContent>
    </Card>
  );
};

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [socialPostArticle, setSocialPostArticle] = useState<Article | null>(null);
  const [isSocialPostOpen, setIsSocialPostOpen] = useState(false);
  const [whatsappArticle, setWhatsappArticle] = useState<Article | null>(null);
  const [isWhatsappOpen, setIsWhatsappOpen] = useState(false);
  const [postImageArticle, setPostImageArticle] = useState<Article | null>(null);
  const [isPostImageOpen, setIsPostImageOpen] = useState(false);
  const [statsArticle, setStatsArticle] = useState<Article | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [articleSearchQuery, setArticleSearchQuery] = useState("");
  const [articleStatusFilter, setArticleStatusFilter] = useState<"all" | "published" | "scheduled" | "draft">("all");
  const [articleSort, setArticleSort] = useState<"newest" | "oldest" | "views" | "title" | "scheduled">("newest");
  // Category management state
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { articles, isLoading: isArticlesLoading, addArticle, updateArticle, bumpArticle, deleteArticle } = useArticles({ includeContent: true });
  const { categories, isLoading: isCategoriesLoading, addCategory, updateCategory, deleteCategory } = useCategories();
  const { todayViews } = useTodayViewCount();
  const { todayNewArticles } = useTodayNewArticles();
  const { articleViews } = useAllArticleViews();
  const { periodViews } = usePeriodViewCount();
  const { visitorStats } = useVisitorStats();
  const [viewsRange, setViewsRange] = useState<ViewRangePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const rangeBounds = getRangeBounds(viewsRange, customFrom, customTo);
  const { topPages, isLoading: isTopPagesLoading } = useTopPages(rangeBounds.from, rangeBounds.to);
  const { resolvePathName } = usePathNames();
  const { comments: pendingComments } = usePendingComments();

  useEffect(() => {
    const clearAuthStorage = () => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
          .forEach((k) => localStorage.removeItem(k));
      } catch (_e) { /* ignore */ }
    };

    const signOutNonAdmin = async () => {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (_e) { /* ignore */ }
      clearAuthStorage();
    };

    const checkAdmin = async (session: any) => {
      if (!session?.user) {
        setIsAdmin(false);
        setIsAuthLoading(false);
        navigate("/auth");
        return;
      }
      setUser(session.user);
      const { data, error } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
      const admin = !error && data === true;
      setIsAdmin(admin);
      setIsAuthLoading(false);
      if (!admin) {
        toast({ title: "גישה למנהלים בלבד", description: "מסך זה מיועד למנהלי המערכת.", variant: "destructive" });
        await signOutNonAdmin();
        navigate("/auth", { replace: true });
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { checkAdmin(session); }, 0);
    });

    supabase.auth.getSession().then(({ data: { session } }) => { checkAdmin(session); });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (_e) { /* ignore */ }
    // Belt & suspenders: purge any stale Supabase auth entries so we don't rehydrate
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_e) { /* ignore */ }
    toast({ title: "התנתקת בהצלחה", description: "להתראות!" });
    navigate("/", { replace: true });
  };

  const handleEditArticle = (article: Article) => {
    setEditingArticle(article);
    setIsEditDialogOpen(true);
  };

  const handleSaveArticle = async (updatedArticle: Article) => {
    await updateArticle(updatedArticle);
  };

  // One confirmation style for every destructive action in the panel.
  const handleDeleteArticle = async (articleId: string) => {
    const article = articles.find((a) => a.id === articleId);
    if (!window.confirm(`למחוק את הכתבה "${article?.title ?? ""}" לצמיתות?`)) return;
    await deleteArticle(articleId);
  };

  // The rewrite agent: same facts, fresh prose, saved straight back onto the
  // article. Long-running (a full model pass), so the row shows a spinner.
  const [rewritingId, setRewritingId] = useState<string | null>(null);
  const handleRewriteArticle = async (article: Article) => {
    if (!window.confirm(`לשכתב את "${article.title}"? הנוסח הנוכחי יוחלף.`)) return;
    setRewritingId(article.id);
    try {
      const result = await invokeEdge<{ ok: boolean; title: string }>("rewrite-article", {
        articleId: article.id,
      });
      toast({ title: "הכתבה שוכתבה", description: result.title });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    } catch (error) {
      toast({
        title: "השכתוב נכשל",
        description: error instanceof Error ? error.message : "שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setRewritingId(null);
    }
  };

  const handleBumpArticle = async (articleId: string) => {
    await bumpArticle(articleId);
  };


  // After a single article is created, immediately offer the designed share
  // post (Canva template) for the fresh article. Bulk import stays silent.
  const openPostImageFor = (created: Article | null) => {
    if (!created) return;
    setPostImageArticle(created);
    setIsPostImageOpen(true);
  };

  const handleAIArticleGenerated = async (newArticle: Omit<Article, "id"> & { id?: string }) => {
    const { id, ...articleWithoutId } = newArticle;
    openPostImageFor(await addArticle(articleWithoutId));
  };

  const handleCreateArticle = async (newArticle: Omit<Article, "id">) => {
    openPostImageFor(await addArticle(newArticle));
  };

  // Import is an upsert: a row whose id matches an existing article updates
  // it in place; anything else inserts. Re-importing an export no longer
  // duplicates the whole site.
  const handleBulkImport = async (newArticles: (Omit<Article, "id"> & { id?: string })[]) => {
    let updated = 0;
    let created = 0;
    for (const article of newArticles) {
      const existing = article.id ? articles.find((a) => a.id === article.id) : undefined;
      if (existing) {
        await updateArticle({ ...existing, ...article, id: existing.id });
        updated++;
      } else {
        const { id: _drop, ...withoutId } = article;
        await addArticle(withoutId);
        created++;
      }
    }
    toast({ title: "הייבוא הושלם", description: `${created} נוספו, ${updated} עודכנו` });
  };

  // Category handlers
  const handleOpenCategoryDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setNewCategoryName(category.name);
      setNewCategorySlug(category.slug);
    } else {
      setEditingCategory(null);
      setNewCategoryName("");
      setNewCategorySlug("");
    }
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!newCategoryName || !newCategorySlug) {
      toast({
        title: "שגיאה",
        description: "יש למלא את כל השדות",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: newCategoryName,
          slug: newCategorySlug,
        });
      } else {
        await addCategory({
          name: newCategoryName,
          slug: newCategorySlug,
          displayOrder: categories.length,
        });
      }
      setIsCategoryDialogOpen(false);
      setEditingCategory(null);
      setNewCategoryName("");
      setNewCategorySlug("");
    } catch (error) {
      // Error is handled in the hook
    }
  };

  // Reorder by swapping positions — the nav renders in display_order, so this
  // is literally rearranging the site's navbar.
  const moveCategory = async (index: number, dir: -1 | 1) => {
    const a = categories[index];
    const b = categories[index + dir];
    if (!a || !b) return;
    await updateCategory(a.id, { displayOrder: index + dir });
    await updateCategory(b.id, { displayOrder: index });
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!window.confirm(`למחוק את הקטגוריה "${category?.name ?? ""}"? כתבות המשויכות אליה יישארו.`)) {
      return;
    }
    await deleteCategory(categoryId);
  };

  const generateSlug = (name: string) => {
    const slugMap: Record<string, string> = {
      'חדשות': 'news',
      'טכנולוגיה': 'technology',
      'כלכלה': 'economy',
      'פוליטיקה': 'politics',
      'אקטואליה': 'current',
      'שוק ההון': 'stocks',
      'ספורט': 'sports',
      'תרבות': 'culture',
      'בריאות': 'health',
    };
    return slugMap[name] || name.toLowerCase().replace(/\s+/g, '-');
  };

  if (isAuthLoading || isAdmin === null || isArticlesLoading || isCategoriesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const stats = [
    { title: "כניסות היום (כל האתר)", value: todayViews.toLocaleString(), icon: Eye, color: "bg-primary" },
    { title: "כניסות השבוע", value: periodViews.week.toLocaleString(), icon: TrendingUp, color: "bg-accent" },
    { title: "כניסות החודש", value: periodViews.month.toLocaleString(), icon: Calendar, color: "bg-secondary" },
    { title: "מבקרים ייחודיים היום", value: (visitorStats?.today ?? 0).toLocaleString(), icon: Users, color: "bg-primary" },
    { title: "מבקרים ייחודיים החודש", value: (visitorStats?.month ?? 0).toLocaleString(), icon: Users, color: "bg-secondary" },
    { title: "סה״כ מבקרים ייחודיים", value: (visitorStats?.total ?? 0).toLocaleString(), icon: Users, color: "bg-muted" },
    { title: "סה״כ כניסות", value: periodViews.allTime.toLocaleString(), icon: BarChart3, color: "bg-muted" },
    { title: "סה״כ כתבות", value: articles.length, icon: Newspaper, color: "bg-primary" },
    { title: "כתבות חדשות היום", value: todayNewArticles, icon: Plus, color: "bg-accent" },
  ];

  return (
    <div className="min-h-screen admin-scope" dir="rtl">
      {/* Chrome the content scrolls under, not an opaque strip that eats a
          band of the viewport. Same material as the public site's header. */}
      <header className="sticky top-0 z-40 glass">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={wordmark} alt="Agendax" width={800} height={107} className="h-6 w-auto" />
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <div className="leading-tight">
              <h1 className="text-sm font-bold vibrant">מערכת ניהול</h1>
              <p className="text-xs text-muted-foreground" dir="ltr">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="press gap-2">
              <Home className="w-4 h-4" />
              לאתר
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="press gap-2 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              התנתק
            </Button>
          </div>
        </div>
        {/* The logo's X, unrolled into a hairline — same as the public header. */}
        <div className="h-0.5 bg-gradient-brand" aria-hidden="true" />
      </header>

      <div className="container py-8">
        {/* Navigation Tabs — a segmented control: the active pill travels to
            the tab you picked instead of teleporting, so the eye keeps track
            of where it is in the panel. */}
        <div className="flex gap-3 mb-8 flex-wrap items-center justify-between">
          <nav className="glass-panel rounded-2xl p-1.5 flex gap-0.5 flex-wrap" aria-label="ניווט ניהול">
            {[
              { id: "dashboard", label: "סקירה כללית", icon: BarChart3 },
              { id: "articles", label: "כתבות", icon: Newspaper },
              { id: "highlights", label: "בזק ומובילה", icon: Zap },
              { id: "comments", label: `תגובות${pendingComments.length > 0 ? ` (${pendingComments.length})` : ""}`, icon: MessageCircle },
              { id: "categories", label: "קטגוריות", icon: Settings },
              { id: "widgets", label: "חלוניות", icon: LayoutGrid },
              { id: "ingest", label: "סוכן חדשות עולמי", icon: Globe },
              { id: "newsletter", label: "ניוזלטר", icon: Users },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`press relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="admin-tab-pill"
                      // Critically damped: the pill chases a click, not a
                      // flick, so overshoot would read as noise.
                      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                      className="absolute inset-0 rounded-xl bg-primary shadow-glow"
                    />
                  )}
                  <tab.icon className="relative w-4 h-4" />
                  <span className="relative">{tab.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setIsAIGeneratorOpen(true)}
              className="press gap-2 bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90"
            >
              <Sparkles className="w-4 h-4" />
              מחולל כתבות AI
            </Button>
          </div>
        </div>

        {/* Tab content rises in from where the pill landed; a remount per tab
            keeps the entrance consistent. Reduced motion collapses this to a
            fade via the global media rule. */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        >
        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <Card key={index} className="spring transition-[transform,box-shadow] hover:shadow-hover hover:-translate-y-0.5">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-gradient-brand shadow-glow">
                        <stat.icon className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{stat.title}</p>
                        <p className="text-2xl font-bold tabular-nums tracking-tight">{stat.value}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Top pages */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  הדפים הנצפים ביותר
                </CardTitle>
                <CardDescription>
                  הספירה כוללת כניסות לכל דפי האתר (כולל דף הבית), רענונים וסורקים אוטומטיים.
                </CardDescription>
                <div className="flex flex-wrap items-center gap-2 pt-3">
                  {([
                    ["today", "היום"],
                    ["yesterday", "אתמול"],
                    ["week", "השבוע"],
                    ["month", "החודש"],
                    ["lastMonth", "חודש שעבר"],
                    ["custom", "בין תאריכים"],
                  ] as [ViewRangePreset, string][]).map(([key, label]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={viewsRange === key ? "default" : "outline"}
                      onClick={() => setViewsRange(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {viewsRange === "custom" && (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-auto"
                    />
                    <span className="text-sm text-muted-foreground">עד</span>
                    <Input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-auto"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {isTopPagesLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : topPages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין נתונים בטווח שנבחר.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3 text-sm">
                      <span className="text-muted-foreground">{topPages.length.toLocaleString()} דפים</span>
                      <span className="font-bold">
                        סה״כ {topPages.reduce((s, p) => s + p.count, 0).toLocaleString()} צפיות
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pl-1">
                      {topPages.map((page) => {
                        const name = resolvePathName(page.path);
                        return (
                          <div key={page.path} className="flex items-center justify-between gap-4 border-b border-border/50 pb-2 last:border-0">
                            <div className="min-w-0">
                              <p className="text-sm truncate">{name ?? page.path}</p>
                              {!name && (
                                <p className="text-xs text-muted-foreground truncate" dir="ltr">{page.path}</p>
                              )}
                            </div>
                            <span className="text-sm font-bold shrink-0">{page.count.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>


            {/* AI Advice */}
            <AdminAIAdvice />

            {/* Backup */}
            <AdminBackup />

            {/* Submit Sitemap to Google */}
            <SitemapSubmitCard />

            {/* Article Calendar */}
            <AdminArticleCalendar
              articles={articles}
              onReschedule={async (article, newIso) => {
                await updateArticle({ ...article, scheduledAt: newIso });
                toast({
                  title: "התזמון עודכן",
                  description: `${article.title} — ${new Date(newIso).toLocaleString("he-IL")}`,
                });
              }}
            />

            {/* Recent Articles */}
            <Card>
              <CardHeader>
                <CardTitle>כתבות אחרונות</CardTitle>
                <CardDescription>הכתבות האחרונות שפורסמו באתר</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {articles.slice(0, 5).map((article) => (
                    <div 
                      key={article.id} 
                      className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg"
                    >
                      <img 
                        src={article.imageUrl}
                        alt={article.title}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium truncate">{article.title}</h4>
                          {article.isDraft && (
                            <Badge variant="secondary" className="text-xs">טיוטה</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{article.date}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {(articleViews[article.id] || 0).toLocaleString()} צפיות
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEditArticle(article)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteArticle(article.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {articles.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">אין כתבות עדיין</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Articles Tab */}
        {activeTab === "articles" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>ניהול כתבות</CardTitle>
                <CardDescription>צפה, ערוך ומחק כתבות</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <ArticleExportImport articles={articles} onImport={handleBulkImport} />
                <Button variant="outline" className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
                  <PenLine className="w-4 h-4" />
                  כתבה ידנית
                </Button>
                <Button className="gap-2" onClick={() => setIsAIGeneratorOpen(true)}>
                  <Sparkles className="w-4 h-4" />
                  כתבה עם AI
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש כתבה לפי כותרת, תקציר או קטגוריה..."
                  value={articleSearchQuery}
                  onChange={(e) => setArticleSearchQuery(e.target.value)}
                  className="pr-10 text-right"
                />
              </div>
              {(() => {
                const now = new Date();
                const counts = {
                  all: articles.length,
                  published: articles.filter(a => !a.isDraft).length,
                  scheduled: articles.filter(a => a.isDraft && a.scheduledAt && new Date(a.scheduledAt) > now).length,
                  draft: articles.filter(a => a.isDraft && (!a.scheduledAt || new Date(a.scheduledAt) <= now)).length,
                };
                const filters: { key: typeof articleStatusFilter; label: string; icon?: any }[] = [
                  { key: "all", label: `הכל (${counts.all})` },
                  { key: "published", label: `פורסמו (${counts.published})` },
                  { key: "scheduled", label: `מתוזמנות (${counts.scheduled})`, icon: Clock },
                  { key: "draft", label: `טיוטות (${counts.draft})` },
                ];
                return (
                  <div className="flex gap-2 flex-wrap mb-4">
                    {filters.map(f => {
                      const Icon = f.icon;
                      return (
                        <Button
                          key={f.key}
                          variant={articleStatusFilter === f.key ? "default" : "outline"}
                          size="sm"
                          className="gap-1"
                          onClick={() => setArticleStatusFilter(f.key)}
                        >
                          {Icon && <Icon className="w-3 h-3" />}
                          {f.label}
                        </Button>
                      );
                    })}
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm mr-auto"
                      value={articleSort}
                      onChange={(e) => setArticleSort(e.target.value as typeof articleSort)}
                      aria-label="מיון כתבות"
                    >
                      <option value="newest">חדש → ישן</option>
                      <option value="oldest">ישן → חדש</option>
                      <option value="views">הכי נצפות</option>
                      <option value="title">לפי כותרת</option>
                      <option value="scheduled">לפי שעת תזמון</option>
                    </select>
                  </div>
                );
              })()}
              <div className="space-y-4">
                {(() => {
                const filtered = articles
                  .filter((article) => {
                    const now = new Date();
                    const isScheduled = !!(article.isDraft && article.scheduledAt && new Date(article.scheduledAt) > now);
                    const isPlainDraft = article.isDraft && !isScheduled;
                    if (articleStatusFilter === "published" && article.isDraft) return false;
                    if (articleStatusFilter === "scheduled" && !isScheduled) return false;
                    if (articleStatusFilter === "draft" && !isPlainDraft) return false;
                    if (!articleSearchQuery.trim()) return true;
                    // Search covers everything an editor remembers about a
                    // piece: title, excerpt, category, author, and the body.
                    const q = articleSearchQuery.toLowerCase();
                    return (
                      article.title.toLowerCase().includes(q) ||
                      article.excerpt.toLowerCase().includes(q) ||
                      article.category.toLowerCase().includes(q) ||
                      (article.author ?? "").toLowerCase().includes(q) ||
                      (article.content ?? "").toLowerCase().includes(q)
                    );
                  })
                  .sort((a, b) => {
                    switch (articleSort) {
                      case "views":
                        return (articleViews[b.id] || 0) - (articleViews[a.id] || 0);
                      case "title":
                        return a.title.localeCompare(b.title, "he");
                      case "oldest":
                        return +new Date(a.publishedAt || a.date) - +new Date(b.publishedAt || b.date);
                      case "scheduled":
                        return +new Date(a.scheduledAt || 0) - +new Date(b.scheduledAt || 0);
                      default:
                        return +new Date(b.publishedAt || b.date) - +new Date(a.publishedAt || a.date);
                    }
                  });
                if (filtered.length === 0) {
                  return (
                    <p className="text-center text-muted-foreground py-10">
                      {articleSearchQuery.trim()
                        ? `לא נמצאו כתבות עבור "${articleSearchQuery}"`
                        : "אין כתבות בסטטוס הזה."}
                    </p>
                  );
                }
                return filtered.map((article) => (
                  <div 
                    key={article.id} 
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <img 
                      src={article.imageUrl}
                      alt={article.title}
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{article.title}</h4>
                        {article.isDraft && !article.scheduledAt && (
                          <Badge variant="secondary" className="text-xs">טיוטה</Badge>
                        )}
                        {article.scheduledAt && new Date(article.scheduledAt) > new Date() && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(article.scheduledAt).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </Badge>
                        )}
                        <ArticleQualityBadge 
                          content={article.content} 
                          title={article.title} 
                          excerpt={article.excerpt} 
                        />
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{article.excerpt}</p>
                      <div className="flex gap-2 mt-2 items-center">
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                          {article.category}
                        </span>
                        <span className="text-xs text-muted-foreground">{article.date}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {(articleViews[article.id] || 0).toLocaleString()} צפיות
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => { setStatsArticle(article); setIsStatsOpen(true); }}>
                        <BarChart3 className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setSocialPostArticle(article); setIsSocialPostOpen(true); }}>
                        <Share2 className="w-4 h-4" />
                        פוסט
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setWhatsappArticle(article); setIsWhatsappOpen(true); }}>
                        <MessageCircle className="w-4 h-4 text-[#25D366]" />
                        וואטסאפ
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setPostImageArticle(article); setIsPostImageOpen(true); }} title="יצירת תמונת פוסט לפי תבנית ה-Canva">
                        <ImageIcon className="w-4 h-4" />
                        תמונה
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => handleBumpArticle(article.id)} title="הקפץ את הכתבה לראש האתר">
                        <ArrowUp className="w-4 h-4" />
                        הקפץ לראש
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={rewritingId === article.id}
                        onClick={() => handleRewriteArticle(article)}
                        title="הסוכן משכתב את הכתבה: אותן עובדות, ניסוח רענן"
                      >
                        {rewritingId === article.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        שכתב AI
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => handleEditArticle(article)}>
                        <Edit className="w-4 h-4" />
                        ערוך
                      </Button>
                      <Button variant="destructive" size="sm" className="gap-2" onClick={() => handleDeleteArticle(article.id)}>
                        <Trash2 className="w-4 h-4" />
                        מחק
                      </Button>

                    </div>
                  </div>
                ));
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Highlights Tab */}
        {activeTab === "highlights" && (
          <AdminHighlightsTab articles={articles} onUpdateArticle={updateArticle} />
        )}

        {/* Comments Tab */}
        {activeTab === "comments" && <AdminCommentsTab />}

        {/* Categories Tab */}
        {activeTab === "categories" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>ניהול קטגוריות</CardTitle>
                <CardDescription>הוסף, ערוך ומחק קטגוריות</CardDescription>
              </div>
              <Button className="gap-2" onClick={() => handleOpenCategoryDialog()}>
                <Plus className="w-4 h-4" />
                קטגוריה חדשה
              </Button>
            </CardHeader>
            <CardContent>
              {/* A list, not a grid: order IS the navbar order, so the layout
                  should read top-to-bottom like the thing it controls. */}
              <div className="space-y-2">
                {categories.map((category, index) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0}
                        onClick={() => moveCategory(index, -1)}
                        aria-label="העלה בסדר"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rotate-180"
                        disabled={index === categories.length - 1}
                        onClick={() => moveCategory(index, 1)}
                        aria-label="הורד בסדר"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <span className="w-6 text-center text-sm font-bold text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium">{category.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {articles.filter(a => a.category === category.name).length} כתבות · slug: {category.slug}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenCategoryDialog(category)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {category.slug !== "home" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeleteCategory(category.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Widgets Tab */}
        {activeTab === "widgets" && <AdminWidgetsTab />}

        {/* Newsletter Tab */}
        {/* Global hi-tech ingest agent */}
        {activeTab === "ingest" && <AdminGlobalIngestTab />}

        {activeTab === "newsletter" && <AdminNewsletterTab />}
        </motion.div>
      </div>

      {/* Edit Article Dialog */}
      <ArticleEditDialog
        article={editingArticle}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSave={handleSaveArticle}
      />

      {/* Manual Article Creation Dialog */}
      <ArticleCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSave={handleCreateArticle}
      />

      {/* AI Article Generator */}
      <AIArticleGenerator
        open={isAIGeneratorOpen}
        onOpenChange={setIsAIGeneratorOpen}
        onArticleGenerated={handleAIArticleGenerated}
      />

      {/* Social Post Generator */}
      <SocialPostGenerator
        article={socialPostArticle}
        open={isSocialPostOpen}
        onOpenChange={setIsSocialPostOpen}
      />

      {/* WhatsApp Post Generator */}
      <WhatsAppPostGenerator
        article={whatsappArticle}
        open={isWhatsappOpen}
        onOpenChange={setIsWhatsappOpen}
      />

      {/* Post Image Generator (Canva template) */}
      <PostImageGenerator
        article={postImageArticle}
        open={isPostImageOpen}
        onOpenChange={setIsPostImageOpen}
      />

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "עריכת קטגוריה" : "קטגוריה חדשה"}</DialogTitle>
            <DialogDescription>
              {editingCategory ? "ערוך את פרטי הקטגוריה" : "הוסף קטגוריה חדשה לאתר"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">שם הקטגוריה</Label>
              <Input
                id="categoryName"
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value);
                  if (!editingCategory) {
                    setNewCategorySlug(generateSlug(e.target.value));
                  }
                }}
                placeholder="לדוגמה: ספורט"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categorySlug">Slug (מזהה באנגלית)</Label>
              <Input
                id="categorySlug"
                value={newCategorySlug}
                onChange={(e) => setNewCategorySlug(e.target.value)}
                dir="ltr"
                placeholder="sports"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleSaveCategory}>
              {editingCategory ? "שמור שינויים" : "הוסף קטגוריה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ArticleStatsDialog
        article={statsArticle}
        open={isStatsOpen}
        onOpenChange={setIsStatsOpen}
      />
    </div>
  );
};

export default Admin;

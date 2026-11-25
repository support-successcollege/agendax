import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import wordmark from "@/assets/agendax-wordmark-light.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Article } from "@/hooks/useArticles";
import { useArticles } from "@/hooks/useArticles";
import { useCategories, Category } from "@/hooks/useCategories";
import { useAllArticleViews } from "@/hooks/usePageViews";
import ArticleEditDialog from "@/components/ArticleEditDialog";
import ArticleCreateDialog from "@/components/ArticleCreateDialog";
import AIArticleGenerator from "@/components/AIArticleGenerator";
import SocialPostGenerator from "@/components/SocialPostGenerator";
import WhatsAppPostGenerator from "@/components/WhatsAppPostGenerator";
import PostImageGenerator from "@/components/PostImageGenerator";
import AdminDashboardTab from "@/components/AdminDashboardTab";
import AdminArticlesTab from "@/components/AdminArticlesTab";
import AdminCommentsTab from "@/components/AdminCommentsTab";
import AdminHighlightsTab from "@/components/AdminHighlightsTab";
import AdminWidgetsTab from "@/components/AdminWidgetsTab";
import AdminNewsletterTab from "@/components/AdminNewsletterTab";
import AdminWritersTab from "@/components/AdminWritersTab";
import AdminGlobalIngestTab from "@/components/AdminGlobalIngestTab";
import AdminSocialTab from "@/components/AdminSocialTab";
import AdminMarketingTab from "@/components/AdminMarketingTab";
import ArticleStatsDialog from "@/components/ArticleStatsDialog";

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
  Zap,
  Share2,
  Globe,
  ArrowUp,
  Menu,
  MessageCircle,
  LayoutGrid,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
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
import { invokeEdge } from "@/lib/edge";
import { useQueryClient } from "@tanstack/react-query";

// Eleven sections are too many for one flat row, so they are grouped by the
// job they serve. The order inside a group follows how often it is opened.
type NavItem = { id: string; label: string; icon: LucideIcon };
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ id: "dashboard", label: "סקירה כללית", icon: BarChart3 }] },
  {
    label: "תוכן",
    items: [
      { id: "articles", label: "כתבות", icon: Newspaper },
      { id: "highlights", label: "בזק ומובילה", icon: Zap },
      { id: "writers", label: "כתבים", icon: PenLine },
      { id: "comments", label: "תגובות", icon: MessageCircle },
      { id: "ingest", label: "סוכן חדשות עולמי", icon: Globe },
    ],
  },
  {
    label: "הפצה",
    items: [
      { id: "social", label: "רשתות חברתיות", icon: Share2 },
      { id: "newsletter", label: "ניוזלטר", icon: Users },
      { id: "marketing", label: "כתבה שיווקית", icon: Megaphone },
    ],
  },
  {
    label: "האתר",
    items: [
      { id: "categories", label: "קטגוריות", icon: Settings },
      { id: "widgets", label: "חלוניות", icon: LayoutGrid },
    ],
  },
];
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const AdminNav = ({
  activeTab,
  onSelect,
  pendingComments,
}: {
  activeTab: string;
  onSelect: (id: string) => void;
  pendingComments: number;
}) => (
  <nav aria-label="ניווט ניהול" className="space-y-4">
    {NAV_GROUPS.map((group, index) => (
      <div key={group.label ?? index}>
        {group.label && (
          <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
        )}
        <ul className="space-y-0.5">
          {group.items.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors lg:h-10 ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.id === "comments" && pendingComments > 0 && (
                    <span className="ms-auto rounded-full bg-primary px-2 py-0.5 text-xs font-bold tabular-nums text-primary-foreground">
                      {pendingComments}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </nav>
);

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  // The open section lives in the address (?tab=articles), so a refresh, the
  // back button and a shared link all land where the editor was working.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = NAV_ITEMS.some((item) => item.id === tabParam) ? (tabParam as string) : "dashboard";
  const [isNavOpen, setIsNavOpen] = useState(false);
  const setActiveTab = (id: string) => {
    setSearchParams(id === "dashboard" ? {} : { tab: id });
    setIsNavOpen(false);
    window.scrollTo({ top: 0 });
  };
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
  const { articleViews } = useAllArticleViews();
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

  if (isAuthLoading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const isDataLoading = isArticlesLoading || isCategoriesLoading;
  const activeItem = NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];

  const accountLinks = (
    <div className="space-y-1 border-t border-border/60 pt-3">
      <p className="truncate px-3 text-xs text-muted-foreground" dir="ltr">
        {user?.email}
      </p>
      <Button variant="ghost" className="h-11 w-full justify-start gap-2.5 px-3 lg:h-10" onClick={() => navigate("/")}>
        <Home className="h-4 w-4" />
        לאתר
      </Button>
      <Button
        variant="ghost"
        className="h-11 w-full justify-start gap-2.5 px-3 text-muted-foreground hover:text-destructive lg:h-10"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        התנתק
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen admin-scope lg:flex" dir="rtl">
      {/* Desktop: the sections sit in a rail beside the work, so the full
          height of the screen belongs to the content. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 border-e border-border/60 bg-surface-1/40 p-4 lg:flex">
        <div className="flex items-center gap-2 px-2 pt-1">
          <img src={wordmark} alt="Agendax" width={800} height={107} className="h-5 w-auto" />
          <span className="text-xs font-medium text-muted-foreground">ניהול</span>
        </div>
        <Button
          onClick={() => setIsAIGeneratorOpen(true)}
          className="gap-2 bg-gradient-brand text-primary-foreground hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" />
          הפקה מהירה
        </Button>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <AdminNav activeTab={activeTab} onSelect={setActiveTab} pendingComments={pendingComments.length} />
        </div>
        {accountLinks}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone and tablet: one bar. The sections wait in a drawer instead of
            wrapping into five rows above the content. */}
        <header className="sticky top-0 z-40 glass lg:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-3">
            <Sheet open={isNavOpen} onOpenChange={setIsNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="פתח תפריט ניווט">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" dir="rtl" className="flex w-72 flex-col gap-4 overflow-y-auto p-4">
                <SheetHeader className="pr-9 text-right">
                  <SheetTitle>מערכת ניהול</SheetTitle>
                  <SheetDescription className="sr-only">ניווט בין מסכי הניהול</SheetDescription>
                </SheetHeader>
                <div className="flex-1">
                  <AdminNav activeTab={activeTab} onSelect={setActiveTab} pendingComments={pendingComments.length} />
                </div>
                {accountLinks}
              </SheetContent>
            </Sheet>
            <img src={wordmark} alt="Agendax" width={800} height={107} className="h-5 w-auto" />
            <Button
              size="icon"
              className="h-11 w-11 bg-gradient-brand text-primary-foreground hover:opacity-90"
              onClick={() => setIsAIGeneratorOpen(true)}
              aria-label="הפקה מהירה"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          </div>
          <div className="h-0.5 bg-gradient-brand" aria-hidden="true" />
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-5 lg:px-8 lg:py-8">
          <h1 className="mb-5 flex items-center gap-2.5 text-[22px] font-bold leading-tight">
            <activeItem.icon className="h-5 w-5 text-primary" aria-hidden="true" />
            {activeItem.label}
          </h1>

          {isDataLoading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
        /* Tab content rises in; a remount per tab keeps the entrance
           consistent. Reduced motion collapses this to a fade via the global
           media rule. */
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        >
        {activeTab === "dashboard" && (
          <AdminDashboardTab
            articles={articles}
            articleViews={articleViews}
            onEdit={handleEditArticle}
            onShowAllArticles={() => setActiveTab("articles")}
            onReschedule={async (article, newIso) => {
              await updateArticle({ ...article, scheduledAt: newIso });
              toast({
                title: "התזמון עודכן",
                description: `${article.title} - ${new Date(newIso).toLocaleString("he-IL")}`,
              });
            }}
          />
        )}

        {activeTab === "articles" && (
          <AdminArticlesTab
            articles={articles}
            articleViews={articleViews}
            rewritingId={rewritingId}
            onEdit={handleEditArticle}
            onDelete={handleDeleteArticle}
            onRewrite={handleRewriteArticle}
            onBump={handleBumpArticle}
            onStats={(article) => { setStatsArticle(article); setIsStatsOpen(true); }}
            onSocialPost={(article) => { setSocialPostArticle(article); setIsSocialPostOpen(true); }}
            onWhatsapp={(article) => { setWhatsappArticle(article); setIsWhatsappOpen(true); }}
            onPostImage={(article) => { setPostImageArticle(article); setIsPostImageOpen(true); }}
            onCreateManual={() => setIsCreateDialogOpen(true)}
            onCreateAI={() => setIsAIGeneratorOpen(true)}
            onImport={handleBulkImport}
          />
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

        {/* Global hi-tech ingest agent */}
        {activeTab === "ingest" && <AdminGlobalIngestTab />}

        {activeTab === "social" && <AdminSocialTab />}

        {activeTab === "marketing" && <AdminMarketingTab />}

        {activeTab === "newsletter" && <AdminNewsletterTab />}
        {activeTab === "writers" && <AdminWritersTab />}
        </motion.div>
          )}
        </main>
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

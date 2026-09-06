import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Users } from "lucide-react";
import {
  saveAuthor,
  useAllAuthors,
  useRefreshAuthors,
  type AuthorDraft,
} from "@/hooks/useAuthors";

/**
 * Edits the newsroom roster.
 *
 * Everything here is public text on a page a reader may use to decide whether
 * the site is trustworthy, so it is worth writing carefully.
 *
 * The slug is not editable: it is the profile's URL and the key every article
 * row points at.
 */
const AdminAuthorsCard = () => {
  const { toast } = useToast();
  const { data: authors, isLoading } = useAllAuthors();
  const refresh = useRefreshAuthors();
  const [drafts, setDrafts] = useState<Record<string, AuthorDraft>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!authors || hydrated) return;
    const next: Record<string, AuthorDraft> = {};
    for (const author of authors) {
      next[author.slug] = {
        name: author.name,
        role: author.role,
        beat: author.beat,
        bio: author.bio,
        modelNote: author.modelNote,
        isActive: author.isActive,
      };
    }
    setDrafts(next);
    setHydrated(true);
  }, [authors, hydrated]);

  const setField = (slug: string, patch: Partial<AuthorDraft>) =>
    setDrafts((prev) => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));

  const handleSave = async (slug: string) => {
    const draft = drafts[slug];
    if (!draft?.name.trim() || !draft.role.trim()) {
      toast({ title: "שם ותפקיד הם שדות חובה", variant: "destructive" });
      return;
    }
    setSavingSlug(slug);
    try {
      await saveAuthor(slug, draft);
      refresh();
      toast({ title: "הפרופיל נשמר" });
    } catch (error) {
      toast({
        title: "השמירה נכשלה",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSavingSlug(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          צוות הכתבים
        </CardTitle>
        <CardDescription>
          כל כתבה נחתמת בשם הסוכן שמסקר את הקטגוריה שלה, ומקושרת לעמוד הפרופיל שלו.
          הטקסטים כאן מוצגים לקוראים בעמוד הפרופיל.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading && (
          <p className="text-sm text-muted-foreground">טוען…</p>
        )}

        {(authors ?? []).map((author) => {
          const draft = drafts[author.slug];
          if (!draft) return null;
          return (
            <div key={author.slug} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {author.avatarUrl && (
                    <img src={author.avatarUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-bold">{draft.name || author.slug}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">/author/{author.slug}</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  פעיל
                  <Switch
                    checked={draft.isActive}
                    onCheckedChange={(isActive) => setField(author.slug, { isActive })}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">שם</label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setField(author.slug, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">תפקיד</label>
                  <Input
                    value={draft.role}
                    onChange={(e) => setField(author.slug, { role: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">תחום סיקור</label>
                <Input
                  value={draft.beat ?? ""}
                  onChange={(e) => setField(author.slug, { beat: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">מי כותב כאן</label>
                <Textarea
                  rows={3}
                  value={draft.bio}
                  onChange={(e) => setField(author.slug, { bio: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  שורת הסיום בפרופיל
                </label>
                <Textarea
                  rows={2}
                  value={draft.modelNote}
                  onChange={(e) => setField(author.slug, { modelNote: e.target.value })}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleSave(author.slug)}
                  disabled={savingSlug === author.slug}
                >
                  {savingSlug === author.slug ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ml-2 h-4 w-4" />
                  )}
                  שמירה
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default AdminAuthorsCard;

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Article } from "@/hooks/useArticles";
import { Download, Upload, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

interface ArticleExportImportProps {
  articles: Article[];
  onImport: (articles: Omit<Article, "id">[]) => Promise<void>;
}

type ImportRow = Record<string, string | number | boolean | null | undefined>;

const EXCEL_CELL_SAFE_LENGTH = 30000;
const exportTextFieldOrder = [
  "כותרת",
  "תקציר",
  "תוכן",
  "קטגוריה",
  "slug קטגוריה",
  "תאריך",
  "כתב",
  "תמונה",
] as const;

type ExportTextFieldLabel = (typeof exportTextFieldOrder)[number];

const getTextValue = (value: ImportRow[string]) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const isTruthyValue = (value: ImportRow[string]) => {
  const normalized = getTextValue(value).trim().toLowerCase();
  return normalized === "כן" || normalized === "true";
};

const splitTextForExcel = (text: string) => {
  if (!text) return [""];

  const parts: string[] = [];
  for (let start = 0; start < text.length; start += EXCEL_CELL_SAFE_LENGTH) {
    parts.push(text.slice(start, start + EXCEL_CELL_SAFE_LENGTH));
  }

  return parts;
};

const getChunkColumnName = (label: string, index: number) =>
  index === 0 ? label : `${label} ${index + 1}`;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCombinedField = (row: ImportRow, labels: string[]) => {
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase();
    const pattern = new RegExp(`^${escapeRegExp(normalizedLabel)}\\s+(\\d+)$`);

    const chunks = Object.entries(row)
      .map(([key, value]) => {
        const normalizedKey = key.toLowerCase();

        if (normalizedKey === normalizedLabel) {
          return { index: 1, value: getTextValue(value) };
        }

        const match = normalizedKey.match(pattern);
        if (!match) return null;

        return { index: Number(match[1]), value: getTextValue(value) };
      })
      .filter((entry): entry is { index: number; value: string } => entry !== null)
      .sort((a, b) => a.index - b.index);

    if (chunks.length > 0) {
      return chunks.map(({ value }) => value).join("");
    }
  }

  return "";
};

const buildExportTextFields = (article: Article): Record<ExportTextFieldLabel, string> => ({
  "כותרת": article.title,
  "תקציר": article.excerpt,
  "תוכן": article.content,
  "קטגוריה": article.category,
  "slug קטגוריה": article.categorySlug,
  "תאריך": article.date,
  "כתב": article.author,
  "תמונה": article.imageUrl,
});

const ArticleExportImport = ({ articles, onImport }: ArticleExportImportProps) => {
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleExport = () => {
    const chunkedFieldsByArticle = articles.map((article) => {
      const fields = buildExportTextFields(article);

      return Object.fromEntries(
        exportTextFieldOrder.map((label) => [label, splitTextForExcel(fields[label])])
      ) as Record<ExportTextFieldLabel, string[]>;
    });

    const maxChunksByField = exportTextFieldOrder.reduce((acc, label) => {
      acc[label] = Math.max(1, ...chunkedFieldsByArticle.map((fields) => fields[label].length));
      return acc;
    }, {} as Record<ExportTextFieldLabel, number>);

    const headers = [
      ...exportTextFieldOrder.flatMap((label) =>
        Array.from({ length: maxChunksByField[label] }, (_, index) => getChunkColumnName(label, index))
      ),
      "חדשות בזק",
      "מובילה",
      "טיוטה",
    ];

    const data = articles.map((article, articleIndex) => {
      const row: Record<string, string> = {};

      exportTextFieldOrder.forEach((label) => {
        const chunks = chunkedFieldsByArticle[articleIndex][label];

        for (let chunkIndex = 0; chunkIndex < maxChunksByField[label]; chunkIndex += 1) {
          row[getChunkColumnName(label, chunkIndex)] = chunks[chunkIndex] ?? "";
        }
      });

      row["חדשות בזק"] = article.isBreaking ? "כן" : "לא";
      row["מובילה"] = article.isFeatured ? "כן" : "לא";
      row["טיוטה"] = article.isDraft ? "כן" : "לא";

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });

    const colWidths = headers.map((header) => ({
      wch: Math.max(header.length, 20),
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "כתבות");
    XLSX.writeFile(wb, `articles_${new Date().toISOString().slice(0, 10)}.xlsx`);

    toast({ title: "הקובץ יוצא בהצלחה", description: `${articles.length} כתבות יוצאו` });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<ImportRow>(ws);

      if (rows.length === 0) {
        toast({ title: "הקובץ ריק", variant: "destructive" });
        return;
      }

      const newArticles: Omit<Article, "id">[] = rows
        .map((row) => ({
          title: getCombinedField(row, ["כותרת", "title"]),
          excerpt: getCombinedField(row, ["תקציר", "excerpt"]),
          content: getCombinedField(row, ["תוכן", "content"]),
          category: getCombinedField(row, ["קטגוריה", "category"]) || "חדשות",
          categorySlug:
            getCombinedField(row, ["slug קטגוריה", "categorySlug", "category_slug"]) || "news",
          date: getCombinedField(row, ["תאריך", "date"]) || new Date().toISOString().slice(0, 10),
          author: getCombinedField(row, ["כתב", "author"]) || "מערכת YZ News",
          imageUrl:
            getCombinedField(row, ["תמונה", "imageUrl", "image_url"]) ||
            "https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=800",
          isBreaking: isTruthyValue(row["חדשות בזק"] ?? row["isBreaking"]),
          isFeatured: isTruthyValue(row["מובילה"] ?? row["isFeatured"]),
          isDraft: isTruthyValue(row["טיוטה"] ?? row["isDraft"]),
          scheduledAt: null,
        }))
        .filter((article) => article.title);

      if (newArticles.length === 0) {
        toast({ title: "לא נמצאו כתבות תקינות בקובץ", variant: "destructive" });
        return;
      }

      await onImport(newArticles);
      toast({ title: "הכתבות יובאו בהצלחה", description: `${newArticles.length} כתבות נוספו` });
    } catch (error) {
      console.error("Import error:", error);
      toast({ title: "שגיאה בייבוא הקובץ", variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImport}
      />
      <Button variant="outline" className="gap-2" onClick={handleExport}>
        <Download className="w-4 h-4" />
        ייצוא Excel
      </Button>
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
      >
        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        ייבוא כתבות
      </Button>
    </>
  );
};

export default ArticleExportImport;

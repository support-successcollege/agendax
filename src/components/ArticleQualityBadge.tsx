import { cn } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ArticleQualityBadgeProps {
  content: string;
  title: string;
  excerpt: string;
}

const ArticleQualityBadge = ({ content, title, excerpt }: ArticleQualityBadgeProps) => {
  // Calculate metrics - strip HTML tags for word count
  const wordCount = content.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const titleLength = title.trim().length;
  const excerptLength = excerpt.trim().length;
  
  // Count paragraphs - handle both HTML (<p> tags) and plain text (double newlines)
  const isHtml = /<[^>]+>/.test(content);
  const paragraphCount = isHtml 
    ? (content.match(/<p[^>]*>/gi) || []).length
    : content.split(/\n\n+/).filter(p => p.trim().length > 0).length;

  // Calculate quality checks
  const checks = [
    { passed: wordCount >= 1000, label: `${wordCount}/1000 מילים` },
    { passed: titleLength >= 30 && titleLength <= 70, label: `כותרת: ${titleLength} תווים` },
    { passed: excerptLength >= 100 && excerptLength <= 200, label: `תקציר: ${excerptLength} תווים` },
    { passed: paragraphCount >= 5, label: `${paragraphCount}/5 פסקאות` },
  ];

  const passedCount = checks.filter(c => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  const getStatus = () => {
    if (score === 100) return { 
      icon: <CheckCircle className="w-4 h-4" />, 
      color: "text-green-600 bg-green-100 dark:bg-green-900/30", 
      label: "איכותי" 
    };
    if (score >= 50) return { 
      icon: <AlertTriangle className="w-4 h-4" />, 
      color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30", 
      label: "חלקי" 
    };
    return { 
      icon: <XCircle className="w-4 h-4" />, 
      color: "text-red-600 bg-red-100 dark:bg-red-900/30", 
      label: "לשיפור" 
    };
  };

  const status = getStatus();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-help",
            status.color
          )}>
            {status.icon}
            <span>{score}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-right" dir="rtl">
          <div className="space-y-1">
            <p className="font-medium">{status.label} - {passedCount}/4 קריטריונים</p>
            {checks.map((check, idx) => (
              <div key={idx} className="flex items-center gap-1 text-xs">
                {check.passed ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ArticleQualityBadge;

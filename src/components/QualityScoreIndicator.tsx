import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle, FileText, Type, AlignLeft } from "lucide-react";

interface QualityScoreIndicatorProps {
  content: string;
  title: string;
  excerpt: string;
}

interface QualityCheck {
  label: string;
  value: number;
  target: number;
  unit: string;
  icon: React.ReactNode;
  passed: boolean;
}

const QualityScoreIndicator = ({ content, title, excerpt }: QualityScoreIndicatorProps) => {
  // Calculate metrics
  const wordCount = content.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const titleLength = title.trim().length;
  const excerptLength = excerpt.trim().length;
  
  // Count paragraphs - handle both HTML (<p> tags) and plain text (double newlines)
  const isHtml = /<[^>]+>/.test(content);
  const paragraphCount = isHtml 
    ? (content.match(/<p[^>]*>/gi) || []).length
    : content.split(/\n\n+/).filter(p => p.trim().length > 0).length;

  // Define quality thresholds based on AdSense requirements
  const checks: QualityCheck[] = [
    {
      label: "מספר מילים",
      value: wordCount,
      target: 1000,
      unit: "מילים",
      icon: <FileText className="w-4 h-4" />,
      passed: wordCount >= 1000,
    },
    {
      label: "אורך כותרת",
      value: titleLength,
      target: 50,
      unit: "תווים",
      icon: <Type className="w-4 h-4" />,
      passed: titleLength >= 30 && titleLength <= 70,
    },
    {
      label: "אורך תקציר",
      value: excerptLength,
      target: 150,
      unit: "תווים",
      icon: <AlignLeft className="w-4 h-4" />,
      passed: excerptLength >= 100 && excerptLength <= 200,
    },
    {
      label: "פסקאות",
      value: paragraphCount,
      target: 5,
      unit: "פסקאות",
      icon: <AlignLeft className="w-4 h-4" />,
      passed: paragraphCount >= 5,
    },
  ];

  const passedChecks = checks.filter(c => c.passed).length;
  const overallScore = Math.round((passedChecks / checks.length) * 100);

  const getOverallStatus = () => {
    if (overallScore >= 100) return { label: "עומד בדרישות", color: "text-green-600", bgColor: "bg-green-100", icon: <CheckCircle className="w-5 h-5 text-green-600" /> };
    if (overallScore >= 75) return { label: "כמעט עומד", color: "text-yellow-600", bgColor: "bg-yellow-100", icon: <AlertTriangle className="w-5 h-5 text-yellow-600" /> };
    if (overallScore >= 50) return { label: "דורש שיפור", color: "text-orange-600", bgColor: "bg-orange-100", icon: <AlertTriangle className="w-5 h-5 text-orange-600" /> };
    return { label: "לא עומד בדרישות", color: "text-red-600", bgColor: "bg-red-100", icon: <XCircle className="w-5 h-5 text-red-600" /> };
  };

  const status = getOverallStatus();

  const getProgressColor = (score: number) => {
    if (score >= 100) return "bg-green-500";
    if (score >= 75) return "bg-yellow-500";
    if (score >= 50) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-background">
      {/* Overall Score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status.icon}
          <span className={cn("font-bold", status.color)}>{status.label}</span>
        </div>
        <div className={cn("px-3 py-1 rounded-full text-sm font-medium", status.bgColor, status.color)}>
          {overallScore}% עמידה בדרישות
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div 
            className={cn("h-full transition-all duration-500", getProgressColor(overallScore))}
            style={{ width: `${overallScore}%` }}
          />
        </div>
      </div>

      {/* Individual Checks */}
      <div className="grid grid-cols-2 gap-3">
        {checks.map((check, idx) => (
          <div 
            key={idx} 
            className={cn(
              "flex items-center gap-2 p-2 rounded border text-sm",
              check.passed 
                ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950" 
                : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
            )}
          >
            <div className={check.passed ? "text-green-600" : "text-red-600"}>
              {check.passed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <div className="font-medium text-xs">{check.label}</div>
              <div className={cn("text-xs", check.passed ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
                {check.value} / {check.target} {check.unit}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {overallScore < 100 && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
          💡 <strong>המלצות:</strong>{" "}
          {!checks[0].passed && `הוסף עוד ${1000 - wordCount} מילים. `}
          {!checks[1].passed && (titleLength < 30 ? "הארך את הכותרת. " : "קצר את הכותרת. ")}
          {!checks[2].passed && (excerptLength < 100 ? "הארך את התקציר. " : "קצר את התקציר. ")}
          {!checks[3].passed && `הוסף עוד ${5 - paragraphCount} פסקאות. `}
        </div>
      )}
    </div>
  );
};

export default QualityScoreIndicator;

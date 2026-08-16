import { useState, useEffect, useCallback } from "react";
import { Accessibility, Plus, Minus, Type, Eye, RotateCcw, X, Moon, Underline, MousePointer, Pause, Focus, ImageOff, BookOpen, Heading, ZapOff, Volume2, AlignJustify } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AccessibilitySettings {
  fontSize: number;
  highContrast: boolean;
  linkHighlight: boolean;
  grayscale: boolean;
  bigCursor: boolean;
  readableFont: boolean;
  lineHeight: number;
  letterSpacing: number;
  stopAnimations: boolean;
  focusHighlight: boolean;
  hideImages: boolean;
  readingMode: boolean;
  headingHighlight: boolean;
  saturation: number; // 0=default, 1=low, 2=high
  textAlign: boolean; // force text-align justify
  wordSpacing: number; // 0-3
}

const defaultSettings: AccessibilitySettings = {
  fontSize: 0,
  highContrast: false,
  linkHighlight: false,
  grayscale: false,
  bigCursor: false,
  readableFont: false,
  lineHeight: 0,
  letterSpacing: 0,
  stopAnimations: false,
  focusHighlight: false,
  hideImages: false,
  readingMode: false,
  headingHighlight: false,
  saturation: 0,
  textAlign: false,
  wordSpacing: 0,
};

const AccessibilityWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    try {
      const saved = localStorage.getItem("a11y-settings");
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const applySettings = useCallback((s: AccessibilitySettings) => {
    const root = document.documentElement;

    // Font size
    const fontSizeMap = [100, 110, 120, 130, 140, 150];
    root.style.fontSize = `${fontSizeMap[s.fontSize]}%`;

    // High contrast
    root.classList.toggle("a11y-high-contrast", s.highContrast);

    // Link highlight
    root.classList.toggle("a11y-link-highlight", s.linkHighlight);

    // Grayscale
    root.classList.toggle("a11y-grayscale", s.grayscale);

    // Big cursor
    root.classList.toggle("a11y-big-cursor", s.bigCursor);

    // Readable font
    root.classList.toggle("a11y-readable-font", s.readableFont);

    // Line height
    const lineHeightMap = ["normal", "1.8", "2.2", "2.6"];
    root.style.setProperty("--a11y-line-height", lineHeightMap[s.lineHeight]);
    root.classList.toggle("a11y-line-height", s.lineHeight > 0);

    // Letter spacing
    const letterSpacingMap = ["normal", "0.05em", "0.1em", "0.15em"];
    root.style.setProperty("--a11y-letter-spacing", letterSpacingMap[s.letterSpacing]);
    root.classList.toggle("a11y-letter-spacing", s.letterSpacing > 0);

    // Stop animations
    root.classList.toggle("a11y-stop-animations", s.stopAnimations);

    // Focus highlight
    root.classList.toggle("a11y-focus-highlight", s.focusHighlight);

    // Hide images
    root.classList.toggle("a11y-hide-images", s.hideImages);

    // Reading mode
    root.classList.toggle("a11y-reading-mode", s.readingMode);

    // Heading highlight
    root.classList.toggle("a11y-heading-highlight", s.headingHighlight);

    // Saturation
    root.classList.toggle("a11y-low-saturation", s.saturation === 1);
    root.classList.toggle("a11y-high-saturation", s.saturation === 2);

    // Text align
    root.classList.toggle("a11y-text-align", s.textAlign);

    // Word spacing
    const wordSpacingMap = ["normal", "0.1em", "0.2em", "0.35em"];
    root.style.setProperty("--a11y-word-spacing", wordSpacingMap[s.wordSpacing]);
    root.classList.toggle("a11y-word-spacing", s.wordSpacing > 0);
  }, []);

  useEffect(() => {
    applySettings(settings);
    localStorage.setItem("a11y-settings", JSON.stringify(settings));
  }, [settings, applySettings]);

  const updateSetting = <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetAll = () => {
    setSettings(defaultSettings);
  };

  const toggleButtons = [
    {
      label: "ניגודיות גבוהה",
      icon: <Eye className="w-5 h-5" aria-hidden="true" />,
      active: settings.highContrast,
      onClick: () => updateSetting("highContrast", !settings.highContrast),
    },
    {
      label: "הדגשת קישורים",
      icon: <Underline className="w-5 h-5" aria-hidden="true" />,
      active: settings.linkHighlight,
      onClick: () => updateSetting("linkHighlight", !settings.linkHighlight),
    },
    {
      label: "גווני אפור",
      icon: <Moon className="w-5 h-5" aria-hidden="true" />,
      active: settings.grayscale,
      onClick: () => updateSetting("grayscale", !settings.grayscale),
    },
    {
      label: "סמן גדול",
      icon: <MousePointer className="w-5 h-5" aria-hidden="true" />,
      active: settings.bigCursor,
      onClick: () => updateSetting("bigCursor", !settings.bigCursor),
    },
    {
      label: "גופן קריא",
      icon: <Type className="w-5 h-5" aria-hidden="true" />,
      active: settings.readableFont,
      onClick: () => updateSetting("readableFont", !settings.readableFont),
    },
    {
      label: "עצירת אנימציות",
      icon: <Pause className="w-5 h-5" aria-hidden="true" />,
      active: settings.stopAnimations,
      onClick: () => updateSetting("stopAnimations", !settings.stopAnimations),
    },
    {
      label: "הדגשת פוקוס",
      icon: <Focus className="w-5 h-5" aria-hidden="true" />,
      active: settings.focusHighlight,
      onClick: () => updateSetting("focusHighlight", !settings.focusHighlight),
    },
    {
      label: "הסתרת תמונות",
      icon: <ImageOff className="w-5 h-5" aria-hidden="true" />,
      active: settings.hideImages,
      onClick: () => updateSetting("hideImages", !settings.hideImages),
    },
    {
      label: "מצב קריאה",
      icon: <BookOpen className="w-5 h-5" aria-hidden="true" />,
      active: settings.readingMode,
      onClick: () => updateSetting("readingMode", !settings.readingMode),
    },
    {
      label: "הדגשת כותרות",
      icon: <Heading className="w-5 h-5" aria-hidden="true" />,
      active: settings.headingHighlight,
      onClick: () => updateSetting("headingHighlight", !settings.headingHighlight),
    },
    {
      label: "יישור טקסט",
      icon: <AlignJustify className="w-5 h-5" aria-hidden="true" />,
      active: settings.textAlign,
      onClick: () => updateSetting("textAlign", !settings.textAlign),
    },
  ];

  const saturationLabels = ["רגיל", "רוויה נמוכה", "רוויה גבוהה"];

  return (
    <>
      {/* Floating Accessibility Button */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="פתח תפריט נגישות"
        className="fixed bottom-6 left-6 z-[9999] p-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform focus:outline-hidden focus:ring-4 focus:ring-ring"
      >
        <Accessibility className="w-6 h-6" />
      </button>

      {/* Accessibility Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-[10000] bg-foreground/40"
              aria-hidden="true"
            />

            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              role="dialog"
              aria-modal="true"
              aria-label="הגדרות נגישות"
              className="fixed top-0 left-0 bottom-0 z-[10001] w-80 max-w-[90vw] bg-card text-card-foreground shadow-2xl overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-primary text-primary-foreground">
                <div className="flex items-center gap-2">
                  <Accessibility className="w-5 h-5" aria-hidden="true" />
                  <h2 className="font-bold text-lg">נגישות</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="סגור תפריט נגישות"
                  className="p-1 rounded hover:bg-primary-foreground/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-6">
                {/* Font Size */}
                <div>
                  <h3 className="font-semibold text-sm mb-3">גודל טקסט</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateSetting("fontSize", Math.max(0, settings.fontSize - 1))}
                      disabled={settings.fontSize === 0}
                      aria-label="הקטן גודל טקסט"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={settings.fontSize} aria-valuemin={0} aria-valuemax={5} aria-label="רמת גודל טקסט">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(settings.fontSize / 5) * 100}%` }} />
                    </div>
                    <button
                      onClick={() => updateSetting("fontSize", Math.min(5, settings.fontSize + 1))}
                      disabled={settings.fontSize === 5}
                      aria-label="הגדל גודל טקסט"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Line Height */}
                <div>
                  <h3 className="font-semibold text-sm mb-3">מרווח שורות</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateSetting("lineHeight", Math.max(0, settings.lineHeight - 1))}
                      disabled={settings.lineHeight === 0}
                      aria-label="הקטן מרווח שורות"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={settings.lineHeight} aria-valuemin={0} aria-valuemax={3} aria-label="רמת מרווח שורות">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(settings.lineHeight / 3) * 100}%` }} />
                    </div>
                    <button
                      onClick={() => updateSetting("lineHeight", Math.min(3, settings.lineHeight + 1))}
                      disabled={settings.lineHeight === 3}
                      aria-label="הגדל מרווח שורות"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Letter Spacing */}
                <div>
                  <h3 className="font-semibold text-sm mb-3">מרווח אותיות</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateSetting("letterSpacing", Math.max(0, settings.letterSpacing - 1))}
                      disabled={settings.letterSpacing === 0}
                      aria-label="הקטן מרווח אותיות"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={settings.letterSpacing} aria-valuemin={0} aria-valuemax={3} aria-label="רמת מרווח אותיות">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(settings.letterSpacing / 3) * 100}%` }} />
                    </div>
                    <button
                      onClick={() => updateSetting("letterSpacing", Math.min(3, settings.letterSpacing + 1))}
                      disabled={settings.letterSpacing === 3}
                      aria-label="הגדל מרווח אותיות"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Word Spacing */}
                <div>
                  <h3 className="font-semibold text-sm mb-3">מרווח מילים</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateSetting("wordSpacing", Math.max(0, settings.wordSpacing - 1))}
                      disabled={settings.wordSpacing === 0}
                      aria-label="הקטן מרווח מילים"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={settings.wordSpacing} aria-valuemin={0} aria-valuemax={3} aria-label="רמת מרווח מילים">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(settings.wordSpacing / 3) * 100}%` }} />
                    </div>
                    <button
                      onClick={() => updateSetting("wordSpacing", Math.min(3, settings.wordSpacing + 1))}
                      disabled={settings.wordSpacing === 3}
                      aria-label="הגדל מרווח מילים"
                      className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Saturation */}
                <div>
                  <h3 className="font-semibold text-sm mb-3">רוויית צבעים</h3>
                  <div className="flex gap-2">
                    {saturationLabels.map((label, i) => (
                      <button
                        key={i}
                        onClick={() => updateSetting("saturation", i as 0 | 1 | 2)}
                        className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                          settings.saturation === i
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle Buttons */}
                <div>
                  <h3 className="font-semibold text-sm mb-3">הגדרות תצוגה</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {toggleButtons.map((btn) => (
                      <button
                        key={btn.label}
                        onClick={btn.onClick}
                        aria-pressed={btn.active}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                          btn.active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border hover:bg-muted"
                        }`}
                      >
                        {btn.icon}
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reset */}
                <button
                  onClick={resetAll}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  איפוס הגדרות
                </button>

                {/* Accessibility Statement Link */}
                <a
                  href="/accessibility"
                  className="block text-center text-sm text-primary underline hover:text-primary/80"
                >
                  הצהרת נגישות
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default AccessibilityWidget;

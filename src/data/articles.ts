// Re-export Article type from hooks
export type { Article } from "@/hooks/useArticles";
export { getArticlesByCategory, getFeaturedArticle, getBreakingNews, getArticleById } from "@/hooks/useArticles";

// Re-export Category type from hooks
export type { Category } from "@/hooks/useCategories";

// Fallback categories for when DB is not available
export const defaultCategories = [
  { id: "1", name: "ראשי", slug: "home", displayOrder: 0, isActive: true },
  { id: "2", name: "חדשות", slug: "news", displayOrder: 1, isActive: true },
  { id: "3", name: "טכנולוגיה", slug: "technology", displayOrder: 2, isActive: true },
  { id: "4", name: "שוק ההון", slug: "stocks", displayOrder: 3, isActive: true },
  { id: "5", name: "כלכלה", slug: "economy", displayOrder: 4, isActive: true },
  { id: "6", name: "פוליטיקה", slug: "politics", displayOrder: 5, isActive: true },
  { id: "7", name: "אקטואליה", slug: "current", displayOrder: 6, isActive: true },
];

// Legacy export for backward compatibility
export const categories = defaultCategories;

// Initial articles for seeding the database
export const initialArticles = [
  {
    title: "הכירו את ה\"מקום שמח\" שלכם: למה הסדרה החדשה של נועה קולר היא יצירת המופת שחיכינו לה",
    excerpt: "יש משהו בנועה קולר שגורם לך להרגיש בבית. ב\"מקום שמח\", הסדרה החדשה שלה ושל רם נהרי בכאן 11, התחושה הזו מגיעה לשיא חדש.",
    content: `יש משהו בנועה קולר שגורם לך להרגיש בבית. לא הבית המעוצב מקטלוגים, אלא הבית האמיתי – זה עם הכביסה על הספה, הכלים בכיור, והשיחות האלה במטבח שנעות בשניות בין צחוק היסטרי לבכי חנוק. ב"מקום שמח", הסדרה החדשה שלה ושל רם נהרי בכאן 11, התחושה הזו מגיעה לשיא חדש, והתוצאה היא לא פחות מנס טלוויזיוני.

על הנייר, התקציר נשמע כמו ההפך הגמור מ"מקום שמח": ורד (קולר), קלינאית תקשורת במשבר גיל ה-40, מתמודדת עם אמא (תיקי דיין האגדית) שרוצה לסיים את חייה. נשמע מדכא? תחשבו שוב. דווקא מתוך התהומות האלו, הסדרה מצליחה להצמיח רגעים של הומור שחור מזוקק, אנושיות מתפרצת ואופטימיות זהירה שחודרת ישר ללב.

**הקסם הקולרי**

קולר, שכבר הוכיחה ב"חזרות" שהיא יודעת לכתוב את הניואנסים הכי דקים של הישראליות, משכללת כאן את השפה שלה.`,
    category: "אקטואליה",
    category_slug: "current",
    date: "2025-11-23",
    image_url: "https://yznews.online/wp-content/uploads/2025/11/1920x1080_no-logo-%D7%9E%D7%A7%D7%95%D7%9D-%D7%A9%D7%9E%D7%97.webp",
    author: "מערכת YZ News",
    is_featured: true,
    is_breaking: false,
  },
  {
    title: "פייפאל ו-OpenAI מכריזות על שותפות מסחרית חדשה",
    excerpt: "חברת פייפאל הודיעה כי תאמץ את פרוטוקול המסחר האגנטי (ACP) כדי להרחיב את יכולות התשלומים והמסחר בתוך ChatGPT של OpenAI.",
    content: `חברת **פייפאל (PayPal, PYPL)** הודיעה כי תאמץ את **פרוטוקול המסחר האגנטי (ACP)** כדי להרחיב את יכולות התשלומים והמסחר בתוך ChatGPT של OpenAI.

לפי ההודעה, משתמשי ChatGPT יוכלו לבצע רכישות ישירות מתוך הפלטפורמה באמצעות הארנק הדיגיטלי של פייפאל.`,
    category: "טכנולוגיה",
    category_slug: "technology",
    date: "2025-10-28",
    image_url: "https://yznews.online/wp-content/uploads/2025/10/%D7%A4%D7%99%D7%99%D7%A4%D7%90%D7%9C.png",
    author: "מערכת YZ News",
    is_breaking: true,
    is_featured: false,
  },
  {
    title: "המדריך השלם לעצמאי המתחיל ב-2025",
    excerpt: "להפוך לעצמאי בישראל הוא צעד משמעותי המשלב יזמות, אחריות אישית והבנה מעמיקה של ההיבטים המשפטיים.",
    content: `להפוך לעצמאי בישראל הוא צעד משמעותי המשלב יזמות, אחריות אישית והבנה מעמיקה של ההיבטים המשפטיים, הפיננסיים והניהוליים הכרוכים בכך.

**1. רישום כעוסק:**

בחירת סוג העוסק: בישראל קיימים מספר סוגי עוסקים.`,
    category: "כלכלה",
    category_slug: "economy",
    date: "2025-01-12",
    image_url: "https://yznews.online/wp-content/uploads/2025/01/image-9.png",
    author: "מערכת YZ News",
    is_breaking: false,
    is_featured: false,
  },
];

import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Terms = () => {
  return (
    <>

      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container py-12">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold text-foreground mb-8">תנאי שימוש</h1>
            <p className="text-muted-foreground mb-8">עודכן לאחרונה: {new Date().toLocaleDateString('he-IL')}</p>
            
            <div className="prose prose-lg max-w-none text-foreground/80 space-y-6">
              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">קבלת התנאים</h2>
                <p>
                  ברוכים הבאים ל-YZ News. השימוש באתר זה מהווה הסכמה לתנאי השימוש המפורטים להלן. 
                  אם אינכם מסכימים לתנאים אלו, אנא הימנעו משימוש באתר.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">השימוש באתר</h2>
                <p>האתר מיועד לשימוש אישי ולא מסחרי בלבד. בשימושכם באתר הנכם מתחייבים:</p>
                <ul className="list-disc list-inside space-y-2 mt-4">
                  <li>לא להשתמש באתר למטרות בלתי חוקיות</li>
                  <li>לא לפגוע בפעילות התקינה של האתר</li>
                  <li>לא להעתיק, לשכפל או להפיץ תכנים מהאתר ללא אישור</li>
                  <li>לא להתחזות לאדם או גוף אחר</li>
                  <li>לא להעלות תכנים פוגעניים, מאיימים או בלתי חוקיים</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">קניין רוחני</h2>
                <p>
                  כל התכנים המופיעים באתר, לרבות טקסטים, תמונות, גרפיקה, לוגואים וסימני מסחר, 
                  מוגנים בזכויות יוצרים ובזכויות קניין רוחני אחרות. אין להעתיק, לשכפל, להפיץ 
                  או לעשות שימוש מסחרי בתכנים אלו ללא אישור מפורש בכתב מ-YZ News.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">תוכן האתר</h2>
                <p>
                  YZ News שואף לספק מידע מדויק ועדכני. עם זאת, איננו מתחייבים לדיוק מוחלט 
                  של כל המידע המתפרסם באתר. התכנים באתר מסופקים "כמות שהם" (AS IS) ללא 
                  אחריות מכל סוג.
                </p>
                <p className="mt-4">
                  המידע באתר אינו מהווה ייעוץ מקצועי מכל סוג, לרבות ייעוץ פיננסי, משפטי 
                  או רפואי. לפני קבלת החלטות על בסיס מידע מהאתר, מומלץ להתייעץ עם אנשי 
                  מקצוע מתאימים.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">קישורים לאתרים חיצוניים</h2>
                <p>
                  האתר עשוי להכיל קישורים לאתרים של צדדים שלישיים. YZ News אינו אחראי לתוכן, 
                  למדיניות הפרטיות או לכל היבט אחר של אתרים אלו. הכניסה לאתרים חיצוניים היא 
                  באחריותכם בלבד.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">פרסומות</h2>
                <p>
                  האתר מציג פרסומות של צדדים שלישיים, לרבות באמצעות Google AdSense. 
                  אין לנו שליטה על תוכן הפרסומות ואיננו אחראים למוצרים או לשירותים 
                  המפורסמים. לחיצה על פרסומות ורכישת מוצרים או שירותים נעשית באחריותכם בלבד.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">הגבלת אחריות</h2>
                <p>
                  YZ News לא יישא באחריות לכל נזק ישיר, עקיף, מקרי או תוצאתי הנובע משימוש 
                  או מאי יכולת להשתמש באתר. זאת כולל, אך לא רק, נזקים הנובעים מאובדן נתונים, 
                  הפרעות בשירות או וירוסים.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">שינויים בתנאי השימוש</h2>
                <p>
                  אנו שומרים לעצמנו את הזכות לעדכן ולשנות תנאי שימוש אלו בכל עת. שינויים 
                  יכנסו לתוקף עם פרסומם באתר. המשך השימוש באתר לאחר פרסום השינויים מהווה 
                  הסכמה לתנאים המעודכנים.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">דין וסמכות שיפוט</h2>
                <p>
                  תנאי שימוש אלו כפופים לחוקי מדינת ישראל. כל מחלוקת הנובעת מהשימוש באתר 
                  תידון בבתי המשפט המוסמכים בישראל בלבד.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">יצירת קשר</h2>
                <p>
                  לשאלות או בקשות בנוגע לתנאי שימוש אלו, ניתן ליצור איתנו קשר:
                </p>
                <ul className="list-none space-y-2 mt-4">
                  <li>📧 אימייל: yzyns44@gmail.com</li>
                  <li>📱 טלפון: 055-9774484</li>
                </ul>
              </section>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Terms;

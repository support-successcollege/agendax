import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Accessibility = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">

      <Header />

      <main className="flex-1 container mx-auto px-4 py-12">
        <article className="max-w-3xl mx-auto bg-card rounded-2xl shadow-card p-8 md:p-12 space-y-6">
          <h1 className="text-3xl font-black text-foreground">הצהרת נגישות</h1>

          <p className="text-foreground/80 leading-relaxed">
            אתר Agendax פועל להנגשת תכניו ושירותיו לאנשים עם מוגבלויות, בהתאם 
            <strong> לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות)</strong>, 
            התשע"ג-2013, ובהתאם <strong>לתקן הישראלי ת"י 5568</strong> ברמת AA של הנחיות WCAG 2.1.
          </p>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">התאמות הנגישות שבוצעו</h2>
            <ul className="list-disc list-inside space-y-2 text-foreground/80 pr-2">
              <li>התאמה לקוראי מסך (NVDA, JAWS, VoiceOver)</li>
              <li>ניווט מלא באמצעות מקלדת בלבד</li>
              <li>אפשרות הגדלת טקסט עד 150%</li>
              <li>שינוי מרווחי שורות ואותיות</li>
              <li>מצב ניגודיות גבוהה</li>
              <li>הדגשת קישורים</li>
              <li>מצב גווני אפור</li>
              <li>סמן מוגדל</li>
              <li>גופן קריא</li>
              <li>טקסט חלופי לתמונות (alt)</li>
              <li>מבנה כותרות היררכי תקין</li>
              <li>תגיות סמנטיות (header, main, nav, footer)</li>
              <li>תגית שפה בעברית (lang="he") ו-dir="rtl"</li>
              <li>דילוג לתוכן ראשי (Skip to content)</li>
              <li>אזורי ARIA מוגדרים (landmarks)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">כפתור הנגישות</h2>
            <p className="text-foreground/80 leading-relaxed">
              כפתור הנגישות ממוקם בפינה השמאלית התחתונה של המסך ומאפשר לכל משתמש להתאים 
              את התצוגה לצרכיו האישיים, כולל הגדלת טקסט, שינוי ניגודיות, הדגשת קישורים ועוד.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">דרכי פנייה</h2>
            <p className="text-foreground/80 leading-relaxed">
              אם נתקלתם בבעיית נגישות באתר, אנא פנו אלינו ונשמח לסייע:
            </p>
            <ul className="list-none space-y-1 text-foreground/80 mt-2">
              <li>📧 דוא"ל: <a href="mailto:info@agendax.co.il" className="text-primary underline" dir="ltr">info@agendax.co.il</a></li>
              <li>📞 טלפון: <a href="tel:0559774484" className="text-primary underline">055-9774484</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">עדכון אחרון</h2>
            <p className="text-foreground/80">
              הצהרת נגישות זו עודכנה לאחרונה בתאריך: {new Date().toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </section>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default Accessibility;

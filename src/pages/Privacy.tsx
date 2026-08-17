import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Privacy = () => {
  return (
    <>

      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container py-12">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold text-foreground mb-8">מדיניות פרטיות</h1>
            <p className="text-muted-foreground mb-8">עודכן לאחרונה: {new Date().toLocaleDateString('he-IL')}</p>
            
            <div className="prose prose-lg max-w-none text-foreground/80 space-y-6">
              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">מבוא</h2>
                <p>
                  ב-Agendax ("האתר", "אנחנו") אנו מכבדים את פרטיות המשתמשים שלנו. מדיניות פרטיות זו 
                  מתארת את סוגי המידע שאנו עשויים לאסוף, כיצד אנו משתמשים בו, וכיצד אנו מגנים עליו.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">מידע שאנו אוספים</h2>
                <p>אנו עשויים לאסוף את סוגי המידע הבאים:</p>
                <ul className="list-disc list-inside space-y-2 mt-4">
                  <li><strong>מידע אישי:</strong> כגון שם וכתובת דוא"ל כאשר אתם נרשמים לניוזלטר שלנו</li>
                  <li><strong>מידע טכני:</strong> כגון כתובת IP, סוג הדפדפן, ומידע על המכשיר שלכם</li>
                  <li><strong>מידע שימוש:</strong> כגון הדפים שביקרתם באתר והזמן שבילתים בהם</li>
                  <li><strong>עוגיות:</strong> אנו משתמשים בעוגיות כדי לשפר את חוויית המשתמש</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">כיצד אנו משתמשים במידע</h2>
                <p>אנו משתמשים במידע שנאסף למטרות הבאות:</p>
                <ul className="list-disc list-inside space-y-2 mt-4">
                  <li>לספק ולשפר את השירותים שלנו</li>
                  <li>לשלוח עדכונים וניוזלטרים (אם נרשמתם אליהם)</li>
                  <li>לנתח את השימוש באתר ולשפר את התוכן</li>
                  <li>להציג פרסומות רלוונטיות</li>
                  <li>לעמוד בדרישות חוקיות</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">עוגיות ופרסום</h2>
                <p>
                  האתר משתמש בעוגיות וטכנולוגיות דומות כדי לשפר את חוויית הגלישה. בנוסף, אנו 
                  משתמשים בשירותי פרסום של צד שלישי (כגון Google AdSense) אשר עשויים להשתמש 
                  בעוגיות כדי להציג פרסומות מותאמות אישית על בסיס הגלישה שלכם.
                </p>
                <p className="mt-4">
                  <strong>שימוש בנתונים על ידי Google:</strong> צדדים שלישיים, כולל Google, עשויים 
                  להציב ולקרוא קובצי Cookie בדפדפן שלכם, או להשתמש ב-Web Beacons כדי לאסוף מידע 
                  כתוצאה מהצגת מודעות באתר. למידע נוסף על האופן שבו Google משתמשת בנתונים כאשר 
                  אתם משתמשים באתרים או באפליקציות של השותפים שלה, בקרו ב:{" "}
                  <a 
                    href="https://www.google.com/policies/privacy/partners/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    מדיניות הפרטיות של Google
                  </a>.
                </p>
                <p className="mt-4">
                  תוכלו לנהל את העדפות העוגיות שלכם דרך הגדרות הדפדפן. שימו לב שחסימת עוגיות 
                  מסוימות עשויה להשפיע על הפונקציונליות של האתר.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">שיתוף מידע</h2>
                <p>
                  אנו לא מוכרים את המידע האישי שלכם לצדדים שלישיים. עם זאת, אנו עשויים לשתף 
                  מידע עם:
                </p>
                <ul className="list-disc list-inside space-y-2 mt-4">
                  <li>ספקי שירות המסייעים לנו בהפעלת האתר</li>
                  <li>שותפי פרסום (מידע אנונימי בלבד)</li>
                  <li>רשויות חוק כאשר נדרש על פי דין</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">אבטחת מידע</h2>
                <p>
                  אנו נוקטים באמצעי אבטחה סבירים כדי להגן על המידע שלכם מפני גישה בלתי מורשית, 
                  שינוי, חשיפה או הרס. עם זאת, אין שיטת העברה באינטרנט או שיטת אחסון אלקטרוני 
                  שהיא בטוחה ב-100%.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">זכויותיכם</h2>
                <p>בהתאם לחוקי הפרטיות החלים, יש לכם את הזכויות הבאות:</p>
                <ul className="list-disc list-inside space-y-2 mt-4">
                  <li>לבקש גישה למידע האישי שלכם</li>
                  <li>לבקש תיקון מידע שגוי</li>
                  <li>לבקש מחיקת המידע שלכם</li>
                  <li>להתנגד לעיבוד המידע שלכם</li>
                  <li>לבטל הרשמה לניוזלטר בכל עת</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">שינויים במדיניות</h2>
                <p>
                  אנו עשויים לעדכן מדיניות פרטיות זו מעת לעת. שינויים משמעותיים יפורסמו באתר 
                  עם תאריך העדכון החדש. המשך השימוש באתר לאחר פרסום השינויים מהווה הסכמה 
                  למדיניות המעודכנת.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">יצירת קשר</h2>
                <p>
                  לשאלות או בקשות בנוגע למדיניות פרטיות זו, ניתן ליצור איתנו קשר:
                </p>
                <ul className="list-none space-y-2 mt-4">
                  <li>📧 אימייל: <span dir="ltr">info@agendax.co.il</span></li>
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

export default Privacy;

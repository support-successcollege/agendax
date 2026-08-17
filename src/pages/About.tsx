import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PartnersCarousel from "@/components/PartnersCarousel";


const About = () => {
  return (
    <>

      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container py-12">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold text-foreground mb-8">אודות Agendax</h1>
            
            <div className="prose prose-lg max-w-none text-foreground/80 space-y-6">
              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">מי אנחנו</h2>
                <p>
                  Agendax מסקר את עולם החדשנות בעברית: הייטק, בינה מלאכותית, שוקי ההון,
                  והחברות שמזיזות את כל אלה. אנחנו כותבים על מה שקורה עכשיו — סבבי גיוס
                  ואקזיטים, מוצרים ומודלים חדשים, דוחות כספיים ומהלכי שוק — ומסבירים למה
                  זה משנה.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">החזון שלנו</h2>
                <p>
                  הטכנולוגיה, ה-AI והכסף כבר מזמן לא שלושה עולמות נפרדים — מה שקורה
                  באחד מגיע לשניים האחרים תוך ימים. Agendax מסקר אותם יחד, כדי שהתמונה
                  שתקבלו תהיה שלמה ותאפשר לכם לקבל החלטות מושכלות.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">הערכים שלנו</h2>
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>אמינות:</strong> אנחנו מחויבים לדיוק ולאמת בכל כתבה שאנחנו מפרסמים</li>
                  <li><strong>הקשר:</strong> לא רק מה קרה, אלא למה זה משנה ומה צפוי אחר כך</li>
                  <li><strong>עדכניות:</strong> אנחנו עובדים סביב השעון כדי להביא לכם את החדשות הכי חמות</li>
                  <li><strong>נגישות:</strong> אנחנו מאמינים שמידע איכותי צריך להיות נגיש לכולם</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">צור קשר</h2>
                <p>
                  יש לכם שאלות, הערות או טיפים לכתבות? אנחנו תמיד שמחים לשמוע מכם!
                </p>
                <ul className="list-none space-y-2 mt-4">
                  <li>📧 אימייל: <span dir="ltr">info@agendax.co.il</span></li>
                  <li className="whitespace-pre-line text-sm text-muted-foreground mt-8">
                    הגבלת אחריות: בעלי האתר, הכותבים או מי מטעמם לא יהיו אחראים לכל נזק, ישיר או עקיף, שייגרם כתוצאה מהשימוש באתר או מהסתמכות על התכנים המופיעים בו.{"\n\n\n"}אין לראות בכל הנאמר באתר המלצה לביצוע פעולות בשוק ההון. השקעה כרוכה בסיכון.
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <PartnersCarousel />

        </main>

        <Footer />
      </div>
    </>
  );
};

export default About;

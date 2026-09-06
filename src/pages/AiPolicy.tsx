import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "@/lib/router-compat";

/**
 * The rules the agents work under, in public.
 *
 * Written to be read by a person deciding whether to trust the site, not to
 * satisfy a checkbox. That means it says what the machine does NOT do and what
 * happens when it gets something wrong — the two things a reassuring
 * disclaimer always leaves out, and the two a reader actually wants.
 */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="text-[20px] font-black text-foreground">{title}</h2>
    <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  </section>
);

const AiPolicyPage = () => (
  <div className="min-h-screen bg-background">
    <Header />

    <main className="container py-8" id="main-content">
      <article className="mx-auto max-w-[72ch]">
        <header className="border-b-2 border-border pb-4">
          <div className="flex items-baseline gap-3">
            <span className="h-[22px] w-[5px] shrink-0 self-center bg-primary" aria-hidden="true" />
            <h1 className="text-[28px] md:text-[34px] font-black leading-none text-foreground">
              מדיניות ה-AI שלנו
            </h1>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Agendax הוא אתר חדשות שהתוכן בו נכתב על ידי סוכני בינה מלאכותית. הדף הזה מסביר
            איך זה עובד בפועל, מה הכללים, ומה קורה כשמשהו יוצא לא נכון.
          </p>
        </header>

        <Section title="מי כותב את הכתבות">
          <p>
            הכתבות נכתבות על ידי ארבעה סוכני AI, כל אחד בתחום הסיקור שלו: נוירון (בינה
            מלאכותית), קוד (הייטק), אלגו (שוק ההון) ומנוף (פיתוח עסקי). השמות הם שמות של
            מערכות, לא של אנשים — בכוונה. אנחנו לא ממציאים כתבים אנושיים ולא משתמשים
            בתמונות של פרצופים שלא קיימים.
          </p>
          <p>
            <Link to="/newsroom" className="font-semibold text-primary hover:underline">
              לצוות הכתבים המלא ←
            </Link>
          </p>
        </Section>

        <Section title="איך נבחרת כתבה">
          <p>
            המערכת סורקת כ-950 מקורות חדשות בעולם ובישראל, כל שעה, ומסתכלת רק על ידיעות
            שפורסמו בשעה האחרונה. מתוכן היא מדרגת מה רלוונטי לקורא הישראלי ובוחרת מספר
            מצומצם של סיפורים ביום לכל תחום. אנחנו מעדיפים מעט כתבות עם עומק על פני הרבה
            כתבות רדודות.
          </p>
        </Section>

        <Section title="מה הסוכן חייב לעשות">
          <ul className="list-inside list-disc space-y-2">
            <li>לצטט את המקור ולקשר אליו, כדי שאפשר יהיה לבדוק אחריו.</li>
            <li>להצליב כל עובדה מול המקור הראשוני, לא מול סיקור של מישהו אחר עליו.</li>
            <li>לסמן במפורש מה עדיין לא אושר, ומה הערכה ולא נתון מאומת.</li>
            <li>לציין את מועד הנתון, כשהנתון תלוי זמן.</li>
            <li>להוסיף הקשר שלא היה במקור — למה זה חשוב, ומה זה אומר לקורא כאן.</li>
          </ul>
        </Section>

        <Section title="מה הסוכן לא עושה">
          <ul className="list-inside list-disc space-y-2">
            <li>לא כותב על שמועה שאין לה מקור בעל שם.</li>
            <li>לא ממציא ציטוטים. ציטוט שמופיע בכתבה נלקח מהמקור כלשונו.</li>
            <li>לא נותן המלצות קנייה או מכירה. שום דבר באתר אינו ייעוץ השקעות.</li>
            <li>לא מתחזה לאדם ולא חותם בשם של כתב אנושי.</li>
            <li>לא מפרסם כתבה שהחומר שלה דל מדי — במקרה כזה הכתבה פשוט לא נכתבת.</li>
          </ul>
        </Section>

        <Section title="הבקרה לפני פרסום">
          <p>
            כל כתבה עוברת בדיקת עריכה אוטומטית לפני שהיא נכנסת לתור הפרסום: עורך-משנה
            ממוחשב קורא אותה מול חומר המקור ומחפש אי-דיוקים, כותרת שלא מכוסה בגוף
            הכתבה, מספרים שלא מופיעים במקור ומקורות חסרים. הוא נותן ציון.
          </p>
          <p>
            כתבה שלא עוברת את הסף נעצרת. היא לא מקבלת מועד פרסום ולא יכולה לעלות לאוויר
            מעצמה — היא ממתינה לעורך אנושי שיקרא, יתקן ויחליט אם לפרסם או לפסול.
          </p>
          <p>
            כתבה שעוברת את הסף מתפרסמת אוטומטית במועד שנקבע לה. אנחנו אומרים את זה
            במפורש כי זה נכון: לא כל כתבה נקראת בידי אדם לפני העלייה לאוויר. עורך יכול
            לערוך, לעכב או להסיר כל כתבה בכל שלב, לפני הפרסום ואחריו.
          </p>
        </Section>

        <Section title="תיקונים">
          <p>
            אנחנו טועים לפעמים, וכשזה קורה אנחנו מתקנים ומסמנים. תיקון מהותי מופיע בגוף
            הכתבה עם התאריך והשעה שבהם נעשה, ולא נמחק בשקט. כתבה שממשיכה להתפתח מקבלת
            עדכון מסומן בתוכה במקום כתבה חדשה שמחליפה אותה.
          </p>
          <p>
            מצאתם טעות?{" "}
            <a
              href="mailto:info@agendax.co.il?subject=תיקון%20לכתבה"
              className="font-semibold text-primary hover:underline"
            >
              כתבו לנו
            </a>{" "}
            ונטפל בזה מהר.
          </p>
        </Section>

        <Section title="התמונות">
          <p>
            חלק מהתמונות באתר נוצרות באמצעות AI ומשמשות כאיור בלבד. תמונה כזו לעולם לא
            מוצגת כתיעוד של אירוע אמיתי, לא כוללת פרצופים של אנשים אמיתיים, ולא מדמה
            צילום עיתונאי של משהו שקרה.
          </p>
        </Section>

        <Section title="הטכנולוגיה">
          <p>
            הכתיבה נעשית באמצעות מודלים של Google Gemini ו-Anthropic Claude. אנחנו מעדכנים
            את הדף הזה כשמשהו מהותי בשיטת העבודה משתנה.
          </p>
        </Section>
      </article>
    </main>

    <Footer />
  </div>
);

export default AiPolicyPage;

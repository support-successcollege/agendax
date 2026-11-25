// Canned backend for the /quick page, loaded only by a dev server with ?mock=1.
// Nothing here touches the network: no login, no database, no model.
//
// Everything is invented and labelled "דמה". The story is about a company that
// does not exist, on purpose: a mock that looked like real news could be
// mistaken for it.
//
// The headline picks the scenario, so each state of the page can be opened:
//   contains "יחיד"     one source only
//   contains "ישן"      a 30-hour-old story (too old for the networks)
//   contains "לינקדאין" LinkedIn's daily cap is full
//   contains "ריק"      nothing readable was found
//   contains "נכשל"     Facebook fails on publish (for the retry button)
import type {
  QuickApi,
  QuickArticle,
  QuickContext,
  QuickDraft,
  QuickNetworkResult,
  QuickSource,
  QuickTeasers,
} from "@/lib/quick.functions";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace("Z", "000+00:00");

const STOCK =
  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&h=675&fit=crop";

const COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#021540"/><stop offset="1" stop-color="#0045DB"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><circle cx="930" cy="190" r="150" fill="#00D0FA" opacity=".28"/><circle cx="280" cy="500" r="230" fill="#00D0FA" opacity=".12"/><path d="M120 470 L400 330 L640 410 L1060 190" stroke="#00D0FA" stroke-width="10" fill="none" stroke-linecap="round"/></svg>`,
  );

const P = 'class="text-foreground/90 leading-relaxed mb-4"';
const H2 =
  'class="text-2xl md:text-3xl font-bold text-foreground mt-8 mb-4 border-b-2 border-primary/20 pb-2"';
const A = 'class="text-primary underline hover:text-primary/80"';

const UNSUPPORTED =
  "החברה מעסיקה היום 120 עובדים, מתוכם 80 בישראל, ומתכננת להגיע ל-200 עובדים עד סוף השנה הבאה.";

const body = (single: boolean): string =>
  [
    `<p ${P}>${single ? "לפי דיווח של כלכלה היום (דמה), חברת" : "חברת"} התוכנה הבדיונית אורביט דאטה הודיעה היום על סבב גיוס של 40 מיליון דולר, שנועד להרחיב את מרכז הפיתוח שלה בתל אביב. לפי ההודעה, הכסף ישמש בעיקר לגיוס מהנדסים ולהאצת הפיתוח של פלטפורמת ניתוח הנתונים של החברה. זו כתבת דמה שנכתבה לבדיקת הדף בלבד, וכל הפרטים בה מומצאים.</p>`,
    `<h2 ${H2}>מה כולל הסבב</h2>`,
    `<p ${P}>את הסבב הובילה קרן ההון סיכון הבדיונית נורת' פיק, בהשתתפות המשקיעים הקיימים של החברה. באורביט דאטה אמרו שהגיוס מביא את סך ההון שגויס עד היום ל-65 מיליון דולר. החברה לא מסרה לפי איזה שווי בוצע הסבב, וציינה רק שהוא גבוה מזה של הסבב הקודם.</p>`,
    `<p ${P}>לפי ההודעה, כמחצית מהסכום תופנה למחקר ופיתוח, והיתרה תשמש להרחבת צוותי המכירות בארצות הברית ובאירופה. ${UNSUPPORTED} רוב המשרות החדשות צפויות להיפתח בתחומי הנדסת נתונים, למידת מכונה ותשתיות ענן.</p>`,
    `<h2 ${H2}>למה עכשיו</h2>`,
    `<p ${P}>באורביט דאטה מסבירים שהביקוש לכלים שמנתחים נתונים בזמן אמת גדל בשנה האחרונה, בעיקר אצל לקוחות בתחומי הפינטק והקמעונאות. החברה מסרה שמספר הלקוחות המשלמים שלה הוכפל בתוך שנה, אבל לא פרסמה נתוני הכנסות. לדבריה, חלק גדול מהלקוחות החדשים הגיעו בעקבות שילוב של יכולות בינה מלאכותית במוצר המרכזי.</p>`,
    `<p ${P}>המנכ"ל הבדיוני של החברה אמר בהודעה שהצוות בתל אביב יישאר מרכז הפיתוח העיקרי גם אחרי ההתרחבות בחו"ל. הוא הוסיף שהחברה בוחנת פתיחה של אתר פיתוח נוסף בצפון הארץ, אבל הדגיש שעדיין לא התקבלה החלטה. לפי ההודעה, תהליך הגיוס של העובדים החדשים יתחיל כבר בחודש הבא ויימשך לאורך כל השנה.</p>`,
    `<p ${P}>הסבב מצטרף לשורה של גיוסים בתחום תשתיות הנתונים בחודשים האחרונים. באורביט דאטה ציינו שהתחרות על מהנדסים מנוסים נשארת האתגר המרכזי שלהם, ושהם מתכוונים להציע לעובדים חדשים גם מסלול הכשרה פנימי. החברה לא מסרה פרטים על תנאי ההעסקה או על היקף התקציב שיוקצה להכשרות.</p>`,
    `<p ${P}>ההודעה לא כללה לוח זמנים מדויק להשקת הגרסה הבאה של המוצר. בחברה אמרו רק שהיא צפויה במהלך המחצית הראשונה של השנה, ושלקוחות קיימים יקבלו גישה מוקדמת לחלק מהיכולות החדשות.</p>`,
    `<div class="why-it-matters"><h2 ${H2}>למה זה חשוב לך</h2>`,
    `<p ${P}>אם אתם מהנדסי נתונים או מפתחים בתחילת הדרך, הסבב הזה אומר שעוד חברה בתל אביב פותחת עשרות משרות בתחום שבו הביקוש ממשיך לגדול. למי שעובד בחברות שמתחרות על אותם עובדים, זו תזכורת שהשוק לא נרגע. ולמי שבוחן כלי ניתוח נתונים לארגון, כדאי לעקוב אחרי קצב הפיתוח של המוצר בחודשים הקרובים.</p></div>`,
    `<p ${P}>קראו גם: <a href="/article/demo-related-story" ${A}>כתבת דמה קשורה מהאתר</a></p>`,
  ].join("");

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 3_600_000).toISOString();

function sourcesFor(single: boolean, old: boolean): QuickSource[] {
  const base = old ? 30 : 1;
  const first: QuickSource = {
    outlet: "כלכלה היום (דמה)",
    domain: "example.com",
    title: "אורביט דאטה גייסה 40 מיליון דולר",
    url: "https://example.com/demo/orbit-data-round",
    publishedAt: hoursAgo(base),
    origin: "bing_news",
    read: true,
  };
  if (single) {
    return [
      first,
      {
        outlet: "TechWire (demo)",
        domain: "example.org",
        title: "Orbit Data raises $40M, report says",
        url: null,
        publishedAt: hoursAgo(base + 0.5),
        origin: "google_news",
        read: false,
        note: "כותרת בלבד, בלי קישור ישיר",
      },
    ];
  }
  return [
    first,
    {
      outlet: "TechWire (demo)",
      domain: "example.org",
      title: "Orbit Data raises $40M to expand Tel Aviv R&D",
      url: "https://example.org/demo/orbit-data",
      publishedAt: hoursAgo(base + 1),
      origin: "bing_news",
      read: true,
    },
    {
      outlet: "דיילי סטארטאפ (דמה)",
      domain: "example.net",
      title: "סבב חדש לאורביט דאטה: 40 מיליון דולר",
      url: "https://example.net/demo/orbit",
      publishedAt: hoursAgo(base + 2),
      origin: "buffer",
      read: true,
    },
    {
      outlet: "Market Brief (demo)",
      domain: "example.edu",
      title: "Orbit Data closes new funding round",
      url: null,
      publishedAt: hoursAgo(base + 2.5),
      origin: "google_news",
      read: false,
      note: "כותרת בלבד, בלי קישור ישיר",
    },
    {
      outlet: "פיננסים עכשיו (דמה)",
      domain: "example.co.il",
      title: "אורביט דאטה מרחיבה את הפיתוח בתל אביב",
      url: "https://example.co.il/demo/orbit",
      publishedAt: hoursAgo(base + 3),
      origin: "bing_news",
      read: false,
      note: "לא נפתח (חסימה או מנוי)",
    },
  ];
}

const SLUG = "דמה-אורביט-דאטה-מגייסת-40-מיליון-דולר";

const teasersFor = (): QuickTeasers => ({
  facebook:
    "💰 עוד סבב גיוס בתל אביב (דמה)\n\nאורביט דאטה הבדיונית סוגרת 40 מיליון דולר ומתכננת להגדיל את צוות הפיתוח שלה.\nמה מקבלים מזה מהנדסי נתונים בארץ? עשרות משרות חדשות בתחום שלא מפסיק לגדול.\n\n📖 לכל הפרטים: https://agendax.co.il/article/" +
    SLUG +
    "\n\n#הייטק #גיוסהון #סטארטאפ #דאטה",
  instagram:
    "💰 40 מיליון דולר לחברת דאטה בתל אביב (דמה)\n\nאורביט דאטה הבדיונית מגדילה את צוות הפיתוח, ורוב המשרות נפתחות כאן בארץ.\nהלינק בביו.\n\n#הייטק #גיוסהון #סטארטאפ #דאטה #תלאביב",
  linkedin:
    "אורביט דאטה (חברת דמה) הודיעה על סבב גיוס של 40 מיליון דולר, שמיועד בעיקר להרחבת מרכז הפיתוח בתל אביב.\n\nהמשמעות לשוק המקומי: ביקוש נוסף למהנדסי נתונים ולמומחי למידת מכונה, בתקופה שבה התחרות על כוח אדם מנוסה נשארת גבוהה.\n\n#הייטק #גיוסהון #דאטה #קריירה",
  whatsapp:
    "💰 דמה: אורביט דאטה מגייסת 40 מיליון דולר ומרחיבה את הפיתוח בתל אביב.\nhttps://agendax.co.il/article/" +
    SLUG,
});

type State = {
  draft: QuickDraft;
  failFacebook: boolean;
  linkedinFull: boolean;
  publishedAt: number | null;
  retried: boolean;
};

const store = new Map<string, State>();

const contextFor = (linkedinFull: boolean): QuickContext => ({
  maxStoryAgeHours: 24,
  enabledPlatforms: ["facebook", "instagram", "linkedin"],
  dmAutomation: true,
  linkedinLinkInComment: true,
  linkedin: { postedToday: linkedinFull ? 5 : 3, cap: 5, full: linkedinFull },
  limits: {
    titleMin: 45,
    titleMax: 70,
    excerptMin: 110,
    excerptMax: 160,
    bodyMinWords: 350,
    minSubheads: 2,
    minReviewScore: 7,
    stockImage: STOCK,
  },
  nextBuildAt: new Date(Date.now() + 2.5 * 3_600_000).toISOString(),
});

function must(productionId: string): State {
  const state = store.get(productionId);
  if (!state) throw new Error("ההפקה לא נמצאה (נתוני דמה מתאפסים בטעינה מחדש)");
  return state;
}

export const quickMockApi: QuickApi = {
  async draft({ title }) {
    await wait(1400);
    if (title.includes("ריק")) {
      throw new Error(
        "נמצאו 4 כותרות על הנושא, אבל אף מקור לא נקרא במלואו. הדביקו קישור ישיר לכתבה אחת לפחות.",
      );
    }
    const single = title.includes("יחיד");
    const old = title.includes("ישן");
    const linkedinFull = title.includes("לינקדאין");
    const sources = sourcesFor(single, old);
    const read = sources.filter((s) => s.read);
    const productionId = crypto.randomUUID();
    const article: QuickArticle = {
      id: crypto.randomUUID(),
      slug: SLUG,
      title: "דמה: אורביט דאטה מגייסת 40 מיליון דולר להרחבת הפיתוח בתל אביב",
      excerpt:
        "נתוני דמה לבדיקת הדף בלבד. חברת התוכנה הבדיונית אורביט דאטה הודיעה על סבב גיוס חדש ועל הגדלת צוות הפיתוח שלה בתל אביב בשנה הקרובה.",
      content: body(single),
      category: "חברות",
      imageUrl: STOCK,
      isDraft: true,
      isBreaking: false,
      publishedAt: null,
      updatedAt: stamp(),
      sourceUrl: read[0].url,
      sourcePublishedAt: read[0].publishedAt,
      reviewScore: null,
      reviewNote: "הפקה מהירה.",
    };
    const draft: QuickDraft = {
      productionId,
      status: "ready",
      origin: "manual",
      requestedTitle: title,
      createdAt: new Date().toISOString(),
      article,
      sources,
      outletsCount: sources.length,
      readCount: read.length,
      singleSource: single,
      singleSourceNote: single
        ? "נקרא מקור אחד בלבד: כלכלה היום (דמה). כלי אחד נוסף מדווח, אבל רק כותרת."
        : null,
      ageUnknown: false,
      unsupported: [],
      overlaps: [],
      teasers: {},
      approvedTeasers: {},
      platforms: [],
      results: null,
      error: null,
      context: contextFor(linkedinFull),
      keyFacts: [
        "סבב של 40 מיליון דולר",
        "סך הגיוסים: 65 מיליון דולר",
        "הרחבת מרכז הפיתוח בתל אביב",
      ],
      existing: single
        ? []
        : [
            {
              title: "כתבת דמה קודמת על אורביט דאטה",
              slug: "demo-previous-story",
              publishedAt: hoursAgo(40),
            },
          ],
    };
    store.set(productionId, {
      draft,
      failFacebook: title.includes("נכשל"),
      linkedinFull,
      publishedAt: null,
      retried: false,
    });
    return structuredClone(draft);
  },

  async get(productionId) {
    await wait(300);
    return structuredClone(must(productionId).draft);
  },

  async recent() {
    await wait(300);
    return [...store.values()].map(({ draft }) => ({
      productionId: draft.productionId,
      requestedTitle: draft.requestedTitle,
      status: draft.status,
      origin: draft.origin,
      singleSource: draft.singleSource,
      createdAt: draft.createdAt,
    }));
  },

  async review({ productionId, content }) {
    await wait(1800);
    const { draft } = must(productionId);
    // The flag follows the text: remove the sentence and the review clears it.
    const flagged = content.includes(UNSUPPORTED);
    const unsupported = flagged
      ? [
          {
            sentence: UNSUPPORTED,
            reason: "המספר 200 והמועד לא מופיעים באף מקור שנקרא",
          },
        ]
      : [];
    const reviewScore = flagged ? 8 : 9;
    draft.unsupported = unsupported;
    draft.article!.reviewScore = reviewScore;
    draft.article!.updatedAt = stamp();
    return {
      reviewScore,
      issues: flagged ? ["יעד העובדים לשנה הבאה לא מגובה במקורות"] : [],
      unsupported,
      singleSource: draft.singleSource,
      singleSourceNote: draft.singleSourceNote,
      articleUpdatedAt: draft.article!.updatedAt,
    };
  },

  async teasers({ productionId }) {
    await wait(1200);
    const { draft } = must(productionId);
    draft.teasers = teasersFor();
    return { teasers: structuredClone(draft.teasers), failed: [] };
  },

  async image({ productionId, imageUrl }) {
    await wait(2200);
    const { draft } = must(productionId);
    draft.article!.imageUrl = imageUrl || COVER;
    draft.article!.updatedAt = stamp();
    return {
      imageUrl: draft.article!.imageUrl,
      articleUpdatedAt: draft.article!.updatedAt,
    };
  },

  async publish(input) {
    await wait(900);
    const state = must(input.productionId);
    const { draft } = state;
    if (draft.status !== "ready")
      throw new Error("ההפקה כבר בתהליך פרסום, פורסמה או לא קיימת");
    if (input.expectedUpdatedAt !== draft.article!.updatedAt) {
      throw new Error(
        "הטיוטה השתנתה מאז שהוצגה, או שכבר פורסמה. טענו את ההפקה מחדש.",
      );
    }
    if (draft.singleSource && !input.acknowledgeSingleSource) {
      throw new Error(
        "הידיעה נשענת על מקור יחיד. סמנו שראיתם את זה לפני הפרסום.",
      );
    }
    const ageHours =
      (Date.now() - Date.parse(draft.article!.sourcePublishedAt!)) / 3_600_000;
    const tooOld = ageHours > draft.context.maxStoryAgeHours;
    const skipped: { platform: string; reason: string }[] = [];
    const platforms: string[] = [];
    for (const p of input.platforms) {
      if (tooOld)
        skipped.push({
          platform: p,
          reason: `הידיעה בת ${Math.round(ageHours)} שעות, ישנה מדי לרשתות`,
        });
      else if (p === "linkedin" && state.linkedinFull)
        skipped.push({
          platform: p,
          reason: "תקרת LinkedIn היומית מלאה (5/5)",
        });
      else platforms.push(p);
    }
    Object.assign(draft.article!, {
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      isBreaking: input.isBreaking,
      isDraft: false,
      publishedAt: new Date().toISOString(),
      updatedAt: stamp(),
    });
    draft.status = "published";
    draft.platforms = platforms;
    draft.approvedTeasers = Object.fromEntries(
      platforms.map((p) => [p, input.teasers[p as "facebook"] ?? ""]),
    );
    state.publishedAt = Date.now();
    return {
      ok: true,
      articleId: draft.article!.id,
      slug: SLUG,
      url: `https://agendax.co.il/article/${encodeURIComponent(SLUG)}`,
      publishedAt: draft.article!.publishedAt!,
      queueId: platforms.length ? crypto.randomUUID() : null,
      platforms,
      skipped,
      nextBuildAt: draft.context.nextBuildAt,
    };
  },

  async status(productionId) {
    await wait(350);
    const state = must(productionId);
    const { draft } = state;
    const elapsed = state.publishedAt ? Date.now() - state.publishedAt : 0;
    // Each network "answers" a few seconds after the last, like the real ones.
    const networks: QuickNetworkResult[] = draft.platforms.map(
      (platform, i) => {
        if (elapsed < 2500 * (i + 1))
          return { platform, state: "waiting", link: null, note: null };
        if (platform === "facebook" && state.failFacebook && !state.retried) {
          return {
            platform,
            state: "failed",
            link: null,
            note: "דמה: (#200) Requires pages_manage_posts permission",
          };
        }
        return {
          platform,
          state: "posted",
          link:
            platform === "instagram"
              ? null
              : `https://example.com/demo-post/${platform}`,
          note: null,
        };
      },
    );
    const done = networks.every((n) => n.state !== "waiting");
    if (done) draft.results = networks;
    return {
      productionId,
      status: draft.status,
      live: draft.status === "published",
      slug: SLUG,
      url: `https://agendax.co.il/article/${encodeURIComponent(SLUG)}`,
      publishedAt: draft.article!.publishedAt,
      done,
      networks,
    };
  },

  async retrySocial(productionId) {
    await wait(500);
    const state = must(productionId);
    state.retried = true;
    state.publishedAt = Date.now();
    return { ok: true };
  },

  async unpublish(productionId) {
    await wait(600);
    const { draft } = must(productionId);
    draft.status = "unpublished";
    draft.article!.isDraft = true;
    return { ok: true };
  },
};

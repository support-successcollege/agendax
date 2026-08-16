import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  AI_URL,
  assertAdmin,
  fetchRss,
  resolveAndFetch,
  mdToArticleHtml,
  researchSystemPrompt,
  WRITE_ARTICLE_TOOL,
  VERIFY_SYSTEM_PROMPT,
  VerificationResult,
  socialPostPrompt,
  whatsappPostPrompt,
  ANALYZE_SITE_SYSTEM_PROMPT,
  analyzeSiteDataPrompt,
} from '@/lib/ai.server';

interface GenerateArticleInput {
  topic: string;
}

interface VerifyArticleInput {
  title: string;
  content: string;
}

interface SocialPostInput {
  title: string;
  excerpt: string;
  category: string;
  url: string;
  content: string;
  imageUrl?: string;
}

interface WhatsappPostInput {
  title: string;
  excerpt: string;
  category: string;
  url: string;
  content: string;
}

export const generateArticle = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: GenerateArticleInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { topic } = data;
    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      throw new Error('יש לספק נושא או ידיעה');
    }

    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY'];
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY חסר');

    const today = new Date().toISOString().slice(0, 10);

    // === Step 1a: Extract Hebrew search query from topic ===
    const queryResp = await fetch(AI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: 'החזר מחרוזת חיפוש קצרה (3-7 מילים) בעברית עבור Google News, ללא מרכאות וללא הסבר. רק המילים.' },
          { role: 'user', content: topic },
        ],
      }),
    });
    let query = topic;
    if (queryResp.ok) {
      const qd = await queryResp.json();
      const q = qd.choices?.[0]?.message?.content?.trim();
      if (q) query = q.replace(/^["']|["']$/g, '').slice(0, 200);
    }

    // === Step 1b: Classify topic ===
    let classification: { isFinancial: boolean; company: string | null; reportType: string | null } = {
      isFinancial: false, company: null, reportType: null,
    };
    try {
      const clsResp = await fetch(AI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: 'סווג את הנושא. החזר JSON תקין בלבד: {"isFinancial": boolean, "company": string|null, "reportType": "רבעוני"|"שנתי"|"חצי-שנתי"|"מיידי"|null}. isFinancial=true אם זה דוח כספי / תוצאות חברה / רווחים / הכנסות / דיווח מאיה.' },
            { role: 'user', content: topic },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (clsResp.ok) {
        const cd = await clsResp.json();
        const raw = cd.choices?.[0]?.message?.content?.trim() || '{}';
        classification = { ...classification, ...JSON.parse(raw) };
      }
    } catch (e) { console.error('classify error', e); }
    console.log('classification:', classification);

    // === Step 1c: Google News RSS ===
    const rssMain = await fetchRss(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:7d')}&hl=he&gl=IL&ceid=IL:he`
    );
    let parsed = rssMain;

    if (classification.isFinancial && classification.company) {
      const mayaRss = await fetchRss(
        `https://news.google.com/rss/search?q=${encodeURIComponent(classification.company + ' site:maya.tase.co.il')}&hl=he&gl=IL&ceid=IL:he`
      );
      const irRss = await fetchRss(
        `https://news.google.com/rss/search?q=${encodeURIComponent(classification.company + ' דוח כספי')}&hl=he&gl=IL&ceid=IL:he`
      );
      parsed = [...mayaRss.slice(0, 4), ...irRss.slice(0, 4), ...rssMain].slice(0, 14);
    }

    const sources: { title: string; url: string }[] = parsed.slice(0, 8).map((p) => ({ title: p.title, url: p.link }));
    let researchText = parsed
      .map((p, i) => `[${i + 1}] ${p.title}\nתאריך: ${p.pubDate}\nתקציר: ${p.desc}\nקישור: ${p.link}`)
      .join('\n\n');

    // === Step 1d: Deep fetch full content of top sources ===
    const toFetch = parsed.slice(0, classification.isFinancial ? 4 : 2);
    const fullTexts = await Promise.all(toFetch.map((p) => resolveAndFetch(p.link)));
    const deepBlocks = fullTexts
      .map((r, i) => (r ? `### מקור מלא ${i + 1}: ${toFetch[i].title}\nכתובת: ${r.url}\n\n${r.text}` : null))
      .filter(Boolean) as string[];

    if (deepBlocks.length > 0) {
      researchText += `\n\n=== תוכן מלא של מקורות מובילים ===\n\n${deepBlocks.join('\n\n---\n\n')}`;
    }

    if (!researchText) {
      researchText = `לא נמצאו תוצאות חיפוש עדכניות. הסתמך על הידיעה המקורית בלבד וציין שהמידע מוגבל.`;
    }

    // === Step 2: Compose Hebrew journalistic article from research ===
    const articleResp = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: researchSystemPrompt(today) },
          {
            role: 'user',
            content: `הידיעה המקורית:\n${topic}\n\n---\n\nתוצאות מחקר עדכניות מהרשת:\n${researchText}`,
          },
        ],
        tools: [WRITE_ARTICLE_TOOL],
        tool_choice: { type: 'function', function: { name: 'write_article' } },
      }),
    });

    if (!articleResp.ok) {
      const t = await articleResp.text();
      console.error('AI article error', articleResp.status, t);
      if (articleResp.status === 429) throw new Error('חריגה ממכסת הבקשות, נסה שוב בעוד רגע');
      if (articleResp.status === 402) throw new Error('אין מספיק קרדיטים בחשבון Lovable AI');
      throw new Error('שגיאה בניסוח הכתבה');
    }

    const articleData = await articleResp.json();
    const toolCall = articleData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('No tool call', JSON.stringify(articleData));
      throw new Error('המודל לא החזיר כתבה תקינה');
    }
    const article = JSON.parse(toolCall.function.arguments);

    // === Step 3: Generate image ===
    let imageUrl: string | null = null;
    try {
      const imgResp = await fetch(AI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [
            {
              role: 'user',
              content: `${article.image_prompt}. Editorial photojournalism style, realistic, high quality, no text or watermarks, 16:9 composition.`,
            },
          ],
          modalities: ['image', 'text'],
        }),
      });
      if (imgResp.ok) {
        const imgData = await imgResp.json();
        imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
      } else {
        console.error('Image gen failed', imgResp.status, await imgResp.text());
      }
    } catch (e) {
      console.error('Image gen exception', e);
    }

    // Append sources at the end of the body (markdown)
    let body = article.body || '';
    if (sources.length > 0) {
      const srcMd = sources
        .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
        .join('\n');
      body += `\n\n## מקורות\n\n${srcMd}`;
    }

    // Build excerpt from subtitle + key_facts fallback
    const excerpt =
      article.subtitle ||
      (Array.isArray(article.key_facts) ? article.key_facts.slice(0, 2).join(' ') : '');

    return {
      title: article.title,
      excerpt,
      content: mdToArticleHtml(body),
      category: article.category || 'חדשות',
      imageUrl: imageUrl ?? 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop',
      sources,
      key_facts: article.key_facts ?? [],
    };
  });

export const verifyArticle = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: VerifyArticleInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { title, content } = data;
    if (!content) throw new Error('תוכן הכתבה חסר');

    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY'];
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Verifying article:', title);

    const verifyResponse = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: VERIFY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `בדוק את אמינות הכתבה הבאה:

כותרת: ${title}

תוכן:
${content}`,
          },
        ],
      }),
    });

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error('AI gateway error:', verifyResponse.status, errorText);

      if (verifyResponse.status === 429) throw new Error('יותר מדי בקשות, נסה שוב בעוד מספר דקות');
      if (verifyResponse.status === 402) throw new Error('נדרש תשלום, הוסף קרדיטים לחשבון Lovable שלך');

      throw new Error(`AI gateway error: ${verifyResponse.status}`);
    }

    const respData = await verifyResponse.json();
    const generatedContent = respData.choices?.[0]?.message?.content;

    if (!generatedContent) throw new Error('No verification result generated');

    console.log('Verification result:', generatedContent);

    let verificationResult: VerificationResult;
    try {
      const cleanContent = generatedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      verificationResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse verification JSON:', parseError);
      verificationResult = {
        overallScore: 5,
        isReliable: false,
        issues: ['לא ניתן היה לנתח את הכתבה באופן מלא'],
        suggestions: ['יש לבדוק את התוכן באופן ידני'],
        factChecks: [],
        summary: 'הבדיקה האוטומטית נכשלה חלקית. מומלץ לבדוק את התוכן באופן ידני.',
      };
    }

    return verificationResult;
  });

export const generateSocialPost = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SocialPostInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { title, excerpt, category, url, content } = data;

    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY'];
    if (!LOVABLE_API_KEY) throw new Error('Missing LOVABLE_API_KEY');

    const truncatedContent = content ? content.substring(0, 2000) : 'לא סופק';

    const prompt = socialPostPrompt({ title, excerpt, category, url, truncatedContent });

    const response = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const respData = await response.json();
    const post = respData.choices?.[0]?.message?.content || '';

    return { post };
  });

export const generateWhatsappPost = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: WhatsappPostInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { title, excerpt, category, url, content } = data;

    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY'];
    if (!LOVABLE_API_KEY) throw new Error('Missing LOVABLE_API_KEY');

    const truncatedContent = content ? content.substring(0, 2000) : 'לא סופק';

    const prompt = whatsappPostPrompt({ title, excerpt, category, url, truncatedContent });

    const response = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const respData = await response.json();
    const post = respData.choices?.[0]?.message?.content || '';

    return { post };
  });

export const analyzeSite = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, never> | undefined) => d)
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY'];
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      { data: topArticles },
      { data: recentViews },
      { data: referrerData },
      { data: articles },
      { data: categories },
      { count: totalViews },
      { count: weekViews },
    ] = await Promise.all([
      supabaseAdmin.rpc('get_article_view_counts'),
      supabaseAdmin.from('page_views').select('article_id, referrer, viewed_at').gte('viewed_at', weekAgo.toISOString()).order('viewed_at', { ascending: false }).limit(500),
      supabaseAdmin.from('page_views').select('referrer, article_id').gte('viewed_at', monthAgo.toISOString()).limit(1000),
      supabaseAdmin.from('articles').select('id, title, category, category_slug, date, is_draft, excerpt').eq('is_draft', false).order('date', { ascending: false }).limit(50),
      supabaseAdmin.from('categories').select('name, slug').eq('is_active', true),
      supabaseAdmin.from('page_views').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('page_views').select('*', { count: 'exact', head: true }).gte('viewed_at', weekAgo.toISOString()),
    ]);

    const viewMap: Record<string, number> = {};
    topArticles?.forEach((r: any) => { if (r.article_id) viewMap[r.article_id] = Number(r.view_count); });

    const enrichedArticles = articles?.map((a: any) => ({
      title: a.title,
      category: a.category,
      date: a.date,
      views: viewMap[a.id] || 0,
    })).sort((a: any, b: any) => b.views - a.views) || [];

    const referrerCounts: Record<string, number> = {};
    referrerData?.forEach((r: any) => {
      const ref = r.referrer || 'ישיר';
      referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    });

    const refToArticle: Record<string, Record<string, number>> = {};
    referrerData?.forEach((r: any) => {
      if (!r.article_id || !r.referrer) return;
      if (!refToArticle[r.referrer]) refToArticle[r.referrer] = {};
      const articleTitle = articles?.find((a: any) => a.id === r.article_id)?.title || r.article_id;
      refToArticle[r.referrer][articleTitle] = (refToArticle[r.referrer][articleTitle] || 0) + 1;
    });

    const categoryViews: Record<string, number> = {};
    articles?.forEach((a: any) => {
      categoryViews[a.category] = (categoryViews[a.category] || 0) + (viewMap[a.id] || 0);
    });

    const dataPrompt = analyzeSiteDataPrompt({
      totalViews: totalViews || 0,
      weekViews: weekViews || 0,
      articlesCount: articles?.length || 0,
      categoryNames: categories?.map((c: any) => c.name).join(', ') || '',
      topArticlesText: enrichedArticles.slice(0, 15).map((a: any, i: number) => `${i + 1}. "${a.title}" (${a.category}) - ${a.views} צפיות, תאריך: ${a.date}`).join('\n'),
      referrersText: Object.entries(referrerCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10).map(([ref, count]) => `- ${ref}: ${count} צפיות`).join('\n'),
      categoryViewsText: Object.entries(categoryViews).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cat, views]) => `- ${cat}: ${views} צפיות`).join('\n'),
      trafficFlowText: Object.entries(refToArticle).slice(0, 5).map(([ref, arts]) => {
        const topArts = Object.entries(arts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 3);
        return `מ-${ref}:\n${topArts.map(([t, c]) => `  → "${t}" (${c} צפיות)`).join('\n')}`;
      }).join('\n'),
    });

    const response = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: ANALYZE_SITE_SYSTEM_PROMPT },
          { role: 'user', content: dataPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('מגבלת בקשות, נסה שוב מאוחר יותר');
      if (response.status === 402) throw new Error('נדרש חידוש מנוי AI');
      const t = await response.text();
      console.error('AI error:', response.status, t);
      throw new Error('AI gateway error');
    }

    const result = await response.json();
    const advice = result.choices?.[0]?.message?.content || 'לא ניתן לייצר ניתוח כרגע';

    return { advice };
  });

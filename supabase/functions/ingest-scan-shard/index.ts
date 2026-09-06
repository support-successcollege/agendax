// deno-lint-ignore-file no-explicit-any
//
// One slice of the hourly feed scan.
//
// Reading ~950 feeds in a single invocation exceeds what one Edge Function is
// allowed to spend: fetching and parsing that many documents is the expensive
// half of the pipeline, and no amount of bounded concurrency makes the total
// work smaller. So the scan runs as several of these in parallel, each taking
// every Nth source, and each dropping what it found into `ingest_scan_buffer`.
//
// This function ranks nothing and writes no articles. `ingest-global-tech`
// picks the buffer up a few minutes later and does all of that once.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  authorize,
  corsHeaders,
  fetchFeed,
  json,
  scanWindow,
  urlKey,
} from "../_shared/ingest.ts";

type Source = {
  id: string;
  name: string;
  feed_url: string;
  weight: number;
  first_failed_at: string | null;
};

/** Bounded so one shard's sockets stay well inside a single worker. */
const FETCH_CONCURRENCY = 24;
/** Leaves room to write the buffer and the source statuses before the limit. */
const FETCH_BUDGET_MS = 60_000;

function hoursAgo(iso: string | null): number {
  if (!iso) return 0;
  return (Date.now() - Date.parse(iso)) / 3_600_000;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const startedAt = Date.now();
  const supabase = adminClient();

  try {
    const body = await req.json().catch(() => ({}));
    const shards = Math.min(Math.max(Number(body?.shards) || 1, 1), 32);
    const shard = Math.min(Math.max(Number(body?.shard) || 0, 0), shards - 1);

    const { feedLookback } = await scanWindow(supabase, Number(body?.lookbackHours) || undefined);

    // Every shard reads the whole (small) source list and keeps its own slice.
    // Ordering by id makes the split stable, so a source belongs to the same
    // shard on every run and its failure history stays coherent.
    const { data: allSources, error: srcErr } = await supabase
      .from("news_sources")
      .select("id, name, feed_url, weight, first_failed_at")
      .eq("is_active", true)
      .order("id", { ascending: true });
    if (srcErr) throw new Error(`טעינת מקורות נכשלה: ${srcErr.message}`);

    const mine = ((allSources || []) as Source[]).filter((_s, i) => i % shards === shard);
    if (mine.length === 0) {
      return json({ ok: true, shard, shards, sources: 0, buffered: 0 });
    }

    const statusUpdates: {
      id: string;
      last_status: string;
      last_item_count: number;
      first_failed_at: string | null;
      deactivate: boolean;
    }[] = [];
    const items: Record<string, unknown>[] = [];
    const deadline = Date.now() + FETCH_BUDGET_MS;
    let ok = 0;
    let failed = 0;
    let skippedForTime = 0;
    let cursor = 0;

    // Each feed is folded the moment it lands. Holding every parsed feed until
    // the pool drains is what ran the old single-worker scan out of memory.
    const absorb = (source: Source, result: Awaited<ReturnType<typeof fetchFeed>>) => {
      if (!result.ok) {
        failed++;
        // A feed that has answered nothing but errors for two straight weeks is
        // dead — switch it off so it stops weighing on every scan.
        const failingSince = source.first_failed_at ? Date.parse(source.first_failed_at) : Date.now();
        statusUpdates.push({
          id: source.id,
          last_status: result.error,
          last_item_count: 0,
          first_failed_at: source.first_failed_at ?? new Date().toISOString(),
          deactivate: Date.now() - failingSince > 14 * 24 * 3600_000,
        });
        return;
      }
      ok++;
      // A feed with no dates at all still gets in — its items are treated as
      // "now", and the URL ledger keeps them from repeating.
      const fresh = result.items.filter(
        (it) => !it.publishedAt || hoursAgo(it.publishedAt) <= feedLookback,
      );
      statusUpdates.push({
        id: source.id,
        last_status: "ok",
        last_item_count: fresh.length,
        first_failed_at: null,
        deactivate: false,
      });
      for (const it of fresh) {
        if (!it.link || !it.title) continue;
        items.push({
          url_key: urlKey(it.link),
          url: it.link,
          title: it.title,
          summary: it.summary ?? "",
          image_url: it.image ?? null,
          source_name: source.name,
          weight: source.weight,
          item_published_at: it.publishedAt,
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(FETCH_CONCURRENCY, mine.length) }, async () => {
        while (true) {
          const index = cursor++;
          if (index >= mine.length) return;
          if (Date.now() > deadline) {
            skippedForTime++;
            continue;
          }
          // 8s, not 12: a slow feed costs the pool a worker, and an hourly scan
          // sees it again in an hour anyway.
          absorb(mine[index], await fetchFeed(mine[index].feed_url, 8000));
        }
      }),
    );

    // Written in slices: one statement per shard would be ideal, but a single
    // jsonb payload of several thousand items is its own memory problem.
    let buffered = 0;
    for (let i = 0; i < items.length; i += 250) {
      const { data, error } = await supabase.rpc("buffer_scan_items", {
        _items: items.slice(i, i + 250),
      });
      if (error) console.error("buffer_scan_items failed", error.message);
      else buffered += Number(data) || 0;
    }

    if (statusUpdates.length > 0) {
      for (let i = 0; i < statusUpdates.length; i += 250) {
        const { error } = await supabase.rpc("touch_news_sources", {
          _updates: statusUpdates.slice(i, i + 250),
        });
        if (error) console.error("touch_news_sources failed", error.message);
      }
    }

    return json({
      ok: true,
      shard,
      shards,
      sources: mine.length,
      sourcesOk: ok,
      sourcesFailed: failed,
      skippedForTime,
      itemsFound: items.length,
      buffered,
      lookbackHours: feedLookback,
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error("ingest-scan-shard failed", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

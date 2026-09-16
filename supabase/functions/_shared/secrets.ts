// Keys the panel can set, resolved at the point of use.
//
// The admin card writes into `integration_secrets`; without this nothing ever
// reads it, and a key typed into the panel would sit in the table doing
// nothing while the card claimed it had taken effect.
//
// Order matters, and it is the order the card promises: Supabase's own secret
// store first, the table second. The secret store is the stronger place — its
// values never touch the database or its backups — so a key already configured
// there keeps working and cannot be overridden from a browser.
//
// The table itself is readable only by the service role: RLS is on and it has
// no policies at all, so the value cannot be selected by the site, by an
// anonymous caller, or by the admin who typed it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

/** Only these may be stored in the table — it must not become a general store. */
const PANEL_KEYS = new Set([
  "PEXELS_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  // Not a key: which provider the model chain tries first.
  "AI_PRIMARY",
]);

/** One fetch of the table per worker; a warm worker reuses it. */
let tableCache: Promise<Record<string, string>> | null = null;

function loadTable(): Promise<Record<string, string>> {
  return (tableCache ??= (async () => {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return {};
    try {
      const supabase = createClient(url, serviceKey);
      const { data, error } = await supabase.from("integration_secrets").select("key, value");
      if (error) {
        console.error("integration_secrets read failed", error.message);
        return {};
      }
      const out: Record<string, string> = {};
      for (const row of (data ?? []) as { key: string; value: string }[]) {
        if (row.value) out[row.key] = row.value;
      }
      return out;
    } catch (e) {
      console.error("integration_secrets read failed", (e as Error).message);
      return {};
    }
  })());
}

/**
 * The value for a key, or "" when it is set nowhere. Never log the result.
 */
export async function getSecret(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv;
  if (!PANEL_KEYS.has(name)) return "";
  return (await loadTable())[name] ?? "";
}

/** Forgets the cached table, so a key saved seconds ago is picked up. */
export function forgetSecrets(): void {
  tableCache = null;
}

// Higgsfield Cloud image generation.
//
// The API is asynchronous: a POST to a model path returns a request id at once,
// and the image appears on the status URL some seconds later. Nothing here
// waits for it. A carousel submits every slide's request up front and the
// panel's refresh loop collects the results, because blocking a worker on seven
// generations would outlast the request long before the images arrived.
//
// Credentials are a key id and a secret, set as Supabase secrets:
//   HIGGSFIELD_API_KEY_ID, HIGGSFIELD_API_KEY_SECRET
// The model path is configurable (HIGGSFIELD_IMAGE_MODEL) so a model can be
// swapped without a deploy of every caller.
//
// Docs: https://docs.higgsfield.ai/docs

const API = "https://api.higgsfield.ai";
const DEFAULT_MODEL = "nano-banana";

export type HiggsfieldStatus =
  | { state: "pending" }
  | { state: "completed"; imageUrl: string }
  | { state: "failed"; reason: string };

function authHeader(): string | null {
  const id = Deno.env.get("HIGGSFIELD_API_KEY_ID");
  const secret = Deno.env.get("HIGGSFIELD_API_KEY_SECRET");
  if (!id || !secret) return null;
  return `Key ${id}:${secret}`;
}

/** True when the secrets are set; callers fall back to the article photo otherwise. */
export const higgsfieldConfigured = () => authHeader() !== null;

/**
 * Submits one 4:5 image. Returns the request id, or throws with the API's own
 * message — a rejected prompt or an exhausted balance should reach the panel as
 * itself, not as "generation failed".
 */
export async function submitImage(prompt: string): Promise<string> {
  const auth = authHeader();
  if (!auth) throw new Error("Higgsfield לא מוגדר — חסרים HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET");

  const model = (Deno.env.get("HIGGSFIELD_IMAGE_MODEL") || DEFAULT_MODEL).replace(/^\/+/, "");
  const resp = await fetch(`${API}/${model}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, aspect_ratio: "4:5", num_images: 1 }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.request_id) {
    const detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data).slice(0, 200);
    throw new Error(`Higgsfield ${resp.status}: ${detail}`);
  }
  return String(data.request_id);
}

/** One status read. Never throws on a transient failure — that is just "pending". */
export async function checkImage(requestId: string): Promise<HiggsfieldStatus> {
  const auth = authHeader();
  if (!auth) return { state: "failed", reason: "Higgsfield לא מוגדר" };

  let resp: Response;
  try {
    resp = await fetch(`${API}/requests/${encodeURIComponent(requestId)}/status`, {
      headers: { Authorization: auth },
    });
  } catch {
    return { state: "pending" };
  }
  // 5xx is the service having a moment; the next refresh asks again.
  if (resp.status >= 500) return { state: "pending" };
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { state: "failed", reason: `Higgsfield ${resp.status}: ${data?.detail ?? "בקשה לא נמצאה"}` };
  }

  switch (data?.status) {
    case "completed": {
      const url = data?.images?.[0]?.url;
      return url ? { state: "completed", imageUrl: String(url) } : { state: "failed", reason: "הבקשה הסתיימה בלי תמונה" };
    }
    case "failed":
      return { state: "failed", reason: "היצירה נכשלה" };
    case "nsfw":
      return { state: "failed", reason: "התמונה נחסמה בסינון התוכן" };
    case "canceled":
      return { state: "failed", reason: "הבקשה בוטלה" };
    default:
      return { state: "pending" };
  }
}

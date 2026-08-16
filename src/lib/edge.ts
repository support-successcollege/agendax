// Thin client for Supabase Edge Functions.
//
// On GitHub Pages there is no server, so every privileged operation that used
// to run inside a TanStack `createServerFn` now runs inside a Supabase Edge
// Function instead. supabase-js attaches the logged-in session's bearer token
// automatically, which is what the functions' own auth checks expect.
import { supabase } from "@/integrations/supabase/client";

/**
 * Edge functions signal failures with a non-2xx status and a JSON body such as
 * `{"error":"..."}`. supabase-js collapses that into a FunctionsHttpError whose
 * message is the useless "Edge Function returned a non-2xx status code", so the
 * real (Hebrew) message has to be read back off the attached Response.
 */
async function extractEdgeError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error) return new Error(body.error);
    } catch {
      const text = await context.clone().text().catch(() => "");
      if (text) return new Error(text);
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function invokeEdge<TResult>(
  name: string,
  body?: Record<string, unknown>,
): Promise<TResult> {
  const { data, error } = await supabase.functions.invoke<TResult>(name, { body: body ?? {} });
  if (error) throw await extractEdgeError(error);
  return data as TResult;
}

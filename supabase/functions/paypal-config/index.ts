import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID') ?? '';
  const mode = (Deno.env.get('PAYPAL_MODE') ?? 'live').toLowerCase();
  return new Response(JSON.stringify({ clientId, mode }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

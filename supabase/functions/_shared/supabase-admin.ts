import { createClient } from "npm:@supabase/supabase-js@2";

// Client com service role — ignora RLS. Só pra uso dentro de Edge Functions
// que já se autenticaram por outro meio (secret de webhook/cron, ou a
// própria natureza pública controlada da function), nunca repassado a um
// client externo.
export function criarClienteAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

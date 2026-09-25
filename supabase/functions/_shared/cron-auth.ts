// Autenticação compartilhada pelas Edge Functions disparadas via pg_cron
// (enviar-lembretes, enviar-aniversarios, lembrete-28-dias). Mesmo padrão de
// secret compartilhado já usado em
// validar-foto (x-webhook-secret) — aqui o header é x-cron-secret e o valor
// esperado vem de CRON_SECRET. Ver PENDENCIAS.md pro passo de configuração.

export function autenticaCron(req: Request): Response | null {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  return null;
}

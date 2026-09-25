// Utilitária de envio de WhatsApp (seção 6 do documento de arquitetura).
// Recebe { telefone, mensagem } e chama a Evolution API. As functions de
// lembrete e notificação não passam por aqui — importam o mesmo cliente
// (_shared/evolution.ts) direto; esta existe pra envio avulso por HTTP
// (ex: `supabase.functions.invoke("send-whatsapp", ...)` com a service role).
//
// Verificação de JWT ligada (o padrão do Supabase): só quem tem a service
// role key ou um JWT de sessão válido chama isso, nunca um anônimo.

import { enviarWhatsApp, EvolutionApiError } from "../_shared/evolution.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "json_invalido" }), { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (typeof b.telefone !== "string" || typeof b.mensagem !== "string") {
    return new Response(
      JSON.stringify({ error: "payload inválido, esperado { telefone, mensagem }" }),
      { status: 400 },
    );
  }

  try {
    await enviarWhatsApp(b.telefone, b.mensagem);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    const status = err instanceof EvolutionApiError && err.status ? 502 : 400;
    return new Response(
      JSON.stringify({ error: "falha_ao_enviar", detail: String(err) }),
      { status },
    );
  }
});

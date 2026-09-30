// Resposta automática a mensagem recebida (fase 17, migration
// 20260930150000). Substitui o workflow "Agente" do n8n: é o webhook de
// mensagem da Evolution API (instância do WhatsApp do studio) que chama isto.
//
// O que faz, por palavra-chave (regras.ts), com prioridade curso > link >
// masculino:
//   - curso      -> não responde nada (a Gisele atende pessoalmente)
//   - link       -> manda o link do app (LINK_APP)
//   - masculino  -> avisa que o atendimento é só pro público feminino
//   - outro      -> não responde; grava em mensagens_nao_classificadas
// Link e aviso têm cooldown de 10 minutos por número
// (reivindicar_resposta_automatica), pra quem manda várias mensagens
// seguidas não receber a mesma resposta várias vezes.
//
// Ignora: eco da própria instância (fromMe), grupo, status, número da
// equipe (profissionais.telefone, com e sem o 9) e mensagem antiga
// reentregue quando a instância reconecta.
//
// Autenticação: a Evolution API não assina o webhook. O secret
// WEBHOOK_WHATSAPP_ENTRADA_SECRET vai no próprio endereço
// (.../functions/v1/responder-whatsapp/<secret>) ou no header
// x-webhook-secret. No endereço funciona em qualquer versão da Evolution,
// inclusive com "Webhook by Events" ligado (que acrescenta
// /messages-upsert no fim). Verificação de JWT desligada, igual às outras
// chamadas de fora.
//
// Sempre responde 200 pra Evolution quando o secret confere (mesmo
// ignorando ou falhando o envio): erro aqui não deve fazer ela reenviar o
// webhook e duplicar resposta. O motivo vai no corpo e nos logs.

import { enviarWhatsApp } from "../_shared/evolution.ts";
import { criarClienteAdmin } from "../_shared/supabase-admin.ts";
import { classificar, lerMensagem, MENSAGEM_MASCULINO, mensagemLink, variantesTelefone } from "./regras.ts";

const COOLDOWN_MINUTOS = 10;

function responder(corpo: Record<string, unknown>, status = 200) {
  if (status === 200) console.log(JSON.stringify(corpo));
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function secretConfere(req: Request, secret: string) {
  if (req.headers.get("x-webhook-secret") === secret) return true;
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  return partes.includes(secret);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_WHATSAPP_ENTRADA_SECRET");
  if (!secret || !secretConfere(req, secret)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (req.method !== "POST") return responder({ ignorado: "método" });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return responder({ ignorado: "json inválido" });
  }

  const msg = lerMensagem(corpo);
  if (msg.ignorar !== undefined) return responder({ ignorado: msg.ignorar });

  const supabase = criarClienteAdmin();

  const { data: equipe, error: erroEquipe } = await supabase
    .from("profissionais")
    .select("id")
    .in("telefone", variantesTelefone(msg.telefone))
    .limit(1);
  if (erroEquipe) return responder({ erro: `profissionais: ${erroEquipe.message}` });
  if (equipe && equipe.length > 0) return responder({ ignorado: "número da equipe" });

  const categoria = classificar(msg.texto);

  if (categoria === "curso") return responder({ categoria, acao: "silêncio" });

  if (categoria === "outro") {
    const { error } = await supabase
      .from("mensagens_nao_classificadas")
      .upsert(
        { telefone: msg.telefone, nome: msg.nome, texto: msg.texto.slice(0, 4000), mensagem_id: msg.mensagemId },
        { onConflict: "mensagem_id", ignoreDuplicates: true },
      );
    return responder(error ? { categoria, erro: error.message } : { categoria, acao: "registrada" });
  }

  let texto = MENSAGEM_MASCULINO;
  if (categoria === "link") {
    const linkApp = Deno.env.get("LINK_APP");
    if (!linkApp) return responder({ categoria, erro: "LINK_APP não configurado" });
    texto = mensagemLink(linkApp);
  }

  const { data: pode, error: erroCooldown } = await supabase.rpc("reivindicar_resposta_automatica", {
    p_telefone: msg.telefone,
    p_categoria: categoria,
    p_cooldown_minutos: COOLDOWN_MINUTOS,
  });
  if (erroCooldown) return responder({ categoria, erro: `cooldown: ${erroCooldown.message}` });
  if (pode !== true) return responder({ categoria, acao: "cooldown" });

  try {
    await enviarWhatsApp(msg.telefone, texto);
    return responder({ categoria, acao: "respondida" });
  } catch (e) {
    return responder({ categoria, erro: `envio: ${String(e)}` });
  }
});

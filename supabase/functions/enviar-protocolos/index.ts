// Protocolo pós-atendimento (migration 20260929150000). Agendada via pg_cron
// a cada 5 minutos. Busca, via RPC protocolos_pendentes, atendimentos que
// terminaram há pelo menos 10 minutos e têm protocolo cadastrado pela
// profissional pra aquele serviço; manda o texto por WhatsApp pra cliente.
//
// Idempotência: reivindicar_protocolo marca protocolo_enviado_em ANTES do
// envio, e só um run do cron recebe true por agendamento — mesmo tradeoff de
// registraEEnvia (falha depois de marcar não reenvia; nunca duplica).
//
// Autenticação: x-cron-secret == CRON_SECRET, igual aos outros lembretes.

import { autenticaCron } from "../_shared/cron-auth.ts";
import { enviarWhatsApp } from "../_shared/evolution.ts";
import { criarClienteAdmin } from "../_shared/supabase-admin.ts";

interface LinhaProtocolo {
  agendamento_id: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  servico_nome: string;
  profissional_nome: string;
  protocolo: string;
}

Deno.serve(async (req) => {
  const negado = autenticaCron(req);
  if (negado) return negado;

  const supabase = criarClienteAdmin();
  const { data: linhas, error } = await supabase.rpc("protocolos_pendentes");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const resumo = { enviado: 0, ja_enviado: 0, falha_envio: 0 };
  const falhas: string[] = [];

  for (const linha of (linhas ?? []) as LinhaProtocolo[]) {
    const { data: minha, error: erroMarca } = await supabase.rpc("reivindicar_protocolo", {
      p_agendamento_id: linha.agendamento_id,
    });
    if (erroMarca || minha !== true) {
      resumo.ja_enviado++;
      continue;
    }

    const primeiroNome = linha.cliente_nome.split(" ")[0];
    const mensagem =
      `Oi, ${primeiroNome}! Obrigada pela visita ao Studio Gisele Lima. 💛\n\n` +
      `Cuidados depois do seu ${linha.servico_nome} (${linha.profissional_nome}):\n\n` +
      linha.protocolo;

    try {
      await enviarWhatsApp(linha.cliente_whatsapp, mensagem);
      resumo.enviado++;
    } catch (e) {
      resumo.falha_envio++;
      falhas.push(`${linha.agendamento_id}: ${String(e)}`);
    }
  }

  return new Response(JSON.stringify({ resumo, falhas }), { status: 200 });
});

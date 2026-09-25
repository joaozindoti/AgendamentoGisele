// Fase 1 — mesma lógica dos lembretes de 24h/1h (seção 6), mas pro aviso
// pós-procedimento que o documento original previa e nunca chegou a ser
// aplicado. Roda uma vez por dia via pg_cron; a janela em dias é
// configurável em `configuracoes` (chave dias_lembrete_pos_procedimento,
// default 28 — dá nome à function, mas o valor real é o do banco).

import { autenticaCron } from "../_shared/cron-auth.ts";
import { criarClienteAdmin } from "../_shared/supabase-admin.ts";
import { registraEEnvia, ResultadoLembrete } from "../_shared/lembrete-log.ts";

interface LinhaPosProcedimento {
  agendamento_id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  servico_nome: string;
}

Deno.serve(async (req) => {
  const negado = autenticaCron(req);
  if (negado) return negado;

  const supabase = criarClienteAdmin();
  const { data: linhas, error } = await supabase.rpc("concluidos_para_lembrete_pos_procedimento");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const resumo: Record<ResultadoLembrete, number> = { enviado: 0, ja_enviado: 0, falha_envio: 0 };

  for (const linha of (linhas ?? []) as LinhaPosProcedimento[]) {
    const mensagem =
      `Oi, ${linha.cliente_nome}! Já faz um tempinho desde o seu ${linha.servico_nome} no Studio Gisele Lima. ` +
      `Bora agendar a manutenção? É só abrir o app e escolher o melhor horário. 💛`;

    const resultado = await registraEEnvia(supabase, {
      agendamentoId: linha.agendamento_id,
      clienteId: linha.cliente_id,
      tipo: "28dias",
      whatsapp: linha.cliente_whatsapp,
      mensagem,
    });
    resumo[resultado]++;
  }

  return new Response(JSON.stringify({ resumo }), { status: 200 });
});

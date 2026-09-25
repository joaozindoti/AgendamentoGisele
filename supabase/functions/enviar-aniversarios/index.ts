// Fase 1 — agendada via pg_cron uma vez por dia (seção 6, migration
// 20260925160000). Busca clientes cujo dia e mês de nascimento é hoje via
// RPC aniversariantes_pendentes (que já filtra quem ainda não recebeu o
// parabéns hoje) e dispara por WhatsApp.

import { autenticaCron } from "../_shared/cron-auth.ts";
import { criarClienteAdmin } from "../_shared/supabase-admin.ts";
import { registraEEnvia, ResultadoLembrete } from "../_shared/lembrete-log.ts";

interface Aniversariante {
  cliente_id: string;
  nome: string;
  whatsapp: string;
}

Deno.serve(async (req) => {
  const negado = autenticaCron(req);
  if (negado) return negado;

  const supabase = criarClienteAdmin();
  const { data: linhas, error } = await supabase.rpc("aniversariantes_pendentes");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const resumo: Record<ResultadoLembrete, number> = { enviado: 0, ja_enviado: 0, falha_envio: 0 };

  for (const linha of (linhas ?? []) as Aniversariante[]) {
    const mensagem =
      `Feliz aniversário, ${linha.nome}! 🎉 A equipe do Studio Gisele Lima deseja um dia lindo, ` +
      `do jeitinho que você merece. Um presentinho te espera na sua próxima visita!`;

    const resultado = await registraEEnvia(supabase, {
      agendamentoId: null,
      clienteId: linha.cliente_id,
      tipo: "aniversario",
      whatsapp: linha.whatsapp,
      mensagem,
    });
    resumo[resultado]++;
  }

  return new Response(JSON.stringify({ resumo }), { status: 200 });
});

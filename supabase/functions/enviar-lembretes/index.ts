// Fase 1 — agendada via pg_cron a cada 15 minutos (seção 6, migration
// 20260925160000). Busca, via RPC lembretes_pendentes, agendamentos
// confirmados cujo início cai em ~24h ou ~1h e ainda não têm a linha
// correspondente em lembretes_enviados; dispara por WhatsApp e loga.
//
// Autenticação: só o pg_cron chama isso (x-cron-secret == CRON_SECRET). Ver
// PENDENCIAS.md pro passo de configurar o secret.

import { autenticaCron } from "../_shared/cron-auth.ts";
import { criarClienteAdmin } from "../_shared/supabase-admin.ts";
import { registraEEnvia, ResultadoLembrete } from "../_shared/lembrete-log.ts";

const FUSO = "America/Fortaleza"; // Pedreiras - MA (ver js/utils.js), sem horário de verão desde 2019.

interface LinhaLembrete {
  agendamento_id: string;
  inicio: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  servico_nome: string;
  profissional_nome: string;
}

function formataDataHora(iso: string) {
  const d = new Date(iso);
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(d);
  return { data, hora };
}

Deno.serve(async (req) => {
  const negado = autenticaCron(req);
  if (negado) return negado;

  const supabase = criarClienteAdmin();
  const resumo: Record<string, Record<ResultadoLembrete, number>> = {
    "24h": { enviado: 0, ja_enviado: 0, falha_envio: 0 },
    "1h": { enviado: 0, ja_enviado: 0, falha_envio: 0 },
  };
  const erros: string[] = [];

  for (const [tipo, horasAlvo] of [["24h", 24], ["1h", 1]] as const) {
    const { data: linhas, error } = await supabase.rpc("lembretes_pendentes", {
      p_tipo: tipo,
      p_horas_alvo: horasAlvo,
      p_margem_minutos: 10,
    });

    if (error) {
      erros.push(`rpc lembretes_pendentes(${tipo}): ${error.message}`);
      continue;
    }

    for (const linha of (linhas ?? []) as LinhaLembrete[]) {
      const { data, hora } = formataDataHora(linha.inicio);
      const mensagem =
        tipo === "24h"
          ? `Oi, ${linha.cliente_nome}! Lembrete do Studio Gisele Lima: você tem ${linha.servico_nome} amanhã, dia ${data} às ${hora}, com ${linha.profissional_nome}. Te esperamos! 💛`
          : `Oi, ${linha.cliente_nome}! Seu horário de ${linha.servico_nome} com ${linha.profissional_nome} é às ${hora}, daqui a pouco. Studio Gisele Lima te espera!`;

      const resultado = await registraEEnvia(supabase, {
        agendamentoId: linha.agendamento_id,
        clienteId: linha.cliente_id,
        tipo,
        whatsapp: linha.cliente_whatsapp,
        mensagem,
      });
      resumo[tipo][resultado]++;
    }
  }

  return new Response(JSON.stringify({ resumo, erros }), { status: 200 });
});

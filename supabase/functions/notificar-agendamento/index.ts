// Fase 1 — Database Webhook em INSERT/UPDATE de agendamentos (seção 6).
// Manda aviso pra cliente e pra profissional responsável em três eventos:
// agendamento criado, remarcado (horário mudou e continua confirmado) e
// cancelado. Remarcação entrou junto com o app da cliente (seção 7), que
// deixa a própria cliente mover o horário — sem esse aviso a profissional
// não ficaria sabendo. concluido/no_show não mandam mensagem.
//
// Autenticação: x-webhook-secret == WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET
// (ver migration 20260925160000). Payload vem como
// {type, table, schema, record, old_record} — NÃO as colunas soltas na
// raiz (mesmo formato documentado oficialmente pelo Supabase que já tinha
// pego validar-foto de surpresa nesta sessão).
//
// registraEEnvia (usado pelas 4 functions de lembrete) NÃO é usado aqui de
// propósito: a unique constraint (agendamento_id, tipo) de lembretes_enviados
// impediria mandar confirmação de novo numa remarcação futura do mesmo
// agendamento. Aqui o log em lembretes_enviados é só auditoria best-effort
// (insert solto, ignora conflito) — quem garante "uma vez por evento" é o
// próprio trigger do Postgres, que dispara exatamente uma vez por linha
// alterada.

import { criarClienteAdmin } from "../_shared/supabase-admin.ts";
import { enviarWhatsApp } from "../_shared/evolution.ts";
import { inicioDoPeriodo } from "../_shared/periodo.ts";

interface Agendamento {
  id: string;
  cliente_id: string;
  profissional_id: string;
  servico_id: string;
  periodo: string;
  status: string;
}

const FUSO = "America/Fortaleza";

function formataDataHora(periodo: string): { data: string; hora: string } {
  const d = inicioDoPeriodo(periodo) ?? new Date();
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(d);
  return { data, hora };
}

async function logAuditoria(
  supabase: ReturnType<typeof criarClienteAdmin>,
  agendamentoId: string,
  clienteId: string,
  tipo: string,
) {
  // best-effort: se já existe linha (agendamento_id, tipo) de uma
  // confirmação/cancelamento anterior do mesmo agendamento, o insert falha
  // por unique_violation e isso é esperado, não um erro real.
  await supabase
    .from("lembretes_enviados")
    .insert({ agendamento_id: agendamentoId, cliente_id: clienteId, tipo })
    .then(() => {}, () => {});
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { type?: string; record?: Agendamento; old_record?: Agendamento | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "json_invalido" }), { status: 400 });
  }

  const { type, record, old_record } = body;
  if (!record) {
    return new Response(JSON.stringify({ skipped: true, motivo: "sem record" }), { status: 200 });
  }

  const evento: "confirmacao" | "cancelamento" | "remarcacao" | null =
    type === "INSERT" && record.status === "confirmado"
      ? "confirmacao"
      : type === "UPDATE" && record.status === "cancelado" && old_record?.status !== "cancelado"
      ? "cancelamento"
      : type === "UPDATE" &&
          record.status === "confirmado" &&
          old_record?.status === "confirmado" &&
          record.periodo !== old_record.periodo
      ? "remarcacao"
      : null;

  if (!evento) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const supabase = criarClienteAdmin();

  const { data: detalhes, error } = await supabase
    .from("agendamentos")
    .select(
      "cliente:clientes(nome, whatsapp), profissional:profissionais(nome, telefone, papel), servico:servicos(nome)",
    )
    .eq("id", record.id)
    .single();

  if (error || !detalhes) {
    return new Response(
      JSON.stringify({ error: "falha_ao_buscar_detalhes", detail: error?.message }),
      { status: 500 },
    );
  }

  const cliente = detalhes.cliente as unknown as { nome: string; whatsapp: string };
  const profissional = detalhes.profissional as unknown as { nome: string; telefone: string | null };
  const servico = detalhes.servico as unknown as { nome: string };
  const { data, hora } = formataDataHora(record.periodo);

  const mensagens = {
    confirmacao: {
      cliente:
        `Agendamento confirmado! ${servico.nome} no dia ${data} às ${hora}, com ${profissional.nome}. ` +
        `Studio Gisele Lima te espera 💛`,
      profissional: `Novo agendamento: ${cliente.nome} — ${servico.nome} em ${data} às ${hora}.`,
    },
    remarcacao: {
      cliente:
        `Horário remarcado! ${servico.nome} agora é no dia ${data} às ${hora}, com ${profissional.nome}. ` +
        `Studio Gisele Lima te espera 💛`,
      profissional: `Remarcação: ${cliente.nome} — ${servico.nome} passou para ${data} às ${hora}.`,
    },
    cancelamento: {
      cliente:
        `Seu agendamento de ${servico.nome} no dia ${data} às ${hora} foi cancelado. ` +
        `Se quiser remarcar, é só abrir o app. Studio Gisele Lima`,
      profissional: `Cancelamento: ${cliente.nome} — ${servico.nome} que era em ${data} às ${hora} foi cancelado.`,
    },
  }[evento];
  const mensagemCliente = mensagens.cliente;
  const mensagemProfissional = mensagens.profissional;

  // Avisa só o profissional responsável pelo agendamento, não Gisele à
  // parte — cobre o caso dela mesma (profissional com papel owner) sem
  // duplicar aviso quando é a staff nova quem está com a agenda.
  const envios: Promise<unknown>[] = [enviarWhatsApp(cliente.whatsapp, mensagemCliente)];
  if (profissional.telefone) {
    envios.push(enviarWhatsApp(profissional.telefone, mensagemProfissional));
  }

  const resultados = await Promise.allSettled(envios);
  // remarcação não vira linha em lembretes_enviados: pode acontecer várias
  // vezes no mesmo agendamento e a unique (agendamento_id, tipo) só guardaria
  // a primeira.
  if (evento !== "remarcacao") {
    await logAuditoria(supabase, record.id, record.cliente_id, evento);
  }

  const falhas = resultados.filter((r) => r.status === "rejected");
  return new Response(JSON.stringify({ ok: falhas.length === 0, falhas: falhas.length }), {
    status: 200,
  });
});

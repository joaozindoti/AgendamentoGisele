// Chamada pelo trigger on_agendamento_notificar (pg_net) em INSERT/UPDATE de agendamentos (seção 6).
// Manda aviso pra cliente e pra profissional responsável em três eventos:
// agendamento criado, remarcado (horário mudou e continua confirmado) e
// cancelado. Remarcação entrou junto com o app da cliente (seção 7), que
// deixa a própria cliente mover o horário — sem esse aviso a profissional
// não ficaria sabendo. concluido/no_show não mandam mensagem.
//
// Fase 25: na remarcação a Gisele (profissional com papel owner) é sempre
// avisada, mesmo quando o atendimento é de outra profissional, com o horário
// antigo e o novo. Se ela mesma é a profissional, recebe um aviso só.
//
// Na confirmação, se a profissional cadastrou protocolo pré-atendimento pra
// esse serviço (profissional_servicos.protocolo_pre, fase 23), a cliente
// recebe o texto numa segunda mensagem, logo depois da confirmação. Os
// textos ficam em mensagens.ts.
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
import { type Evento, mensagemGiseleRemarcacao, mensagemProfissional, mensagensCliente } from "./mensagens.ts";

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

  const evento: Evento | null =
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

  // Sem texto (ou erro na leitura), segue só com a confirmação.
  let protocoloPre: string | null = null;
  if (evento === "confirmacao") {
    const { data: ps } = await supabase
      .from("profissional_servicos")
      .select("protocolo_pre")
      .eq("profissional_id", record.profissional_id)
      .eq("servico_id", record.servico_id)
      .maybeSingle();
    protocoloPre = ps?.protocolo_pre ?? null;
  }

  const anterior = evento === "remarcacao" && old_record ? formataDataHora(old_record.periodo) : null;
  const dados = {
    clienteNome: cliente.nome,
    servicoNome: servico.nome,
    profissionalNome: profissional.nome,
    data,
    hora,
    dataAnterior: anterior?.data,
    horaAnterior: anterior?.hora,
  };
  const mensagensDaCliente = mensagensCliente(evento, dados, protocoloPre);

  // Confirmação e cancelamento avisam só o profissional responsável — cobre
  // o caso da Gisele (papel owner) quando o atendimento é dela. Remarcação
  // avisa também a Gisele quando é de outra profissional (fase 25).
  // As da cliente vão uma depois da outra, pra chegarem na ordem (o
  // protocolo pré nunca antes da confirmação, nem sozinho se ela falhar).
  const envios: Promise<unknown>[] = [
    (async () => {
      for (const m of mensagensDaCliente) await enviarWhatsApp(cliente.whatsapp, m);
    })(),
  ];
  if (profissional.telefone) {
    envios.push(enviarWhatsApp(profissional.telefone, mensagemProfissional(evento, dados)));
  }
  if (evento === "remarcacao") {
    const { data: donas, error: erroDonas } = await supabase
      .from("profissionais")
      .select("telefone")
      .eq("papel", "owner")
      .eq("ativo", true)
      .not("telefone", "is", null);
    if (erroDonas) {
      envios.push(Promise.reject(new Error(`profissionais owner: ${erroDonas.message}`)));
    }
    for (const dona of donas ?? []) {
      if (dona.telefone === profissional.telefone) continue; // já recebeu acima
      envios.push(enviarWhatsApp(dona.telefone as string, mensagemGiseleRemarcacao(dados)));
    }
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

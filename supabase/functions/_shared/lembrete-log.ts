// Registra o envio em lembretes_enviados ANTES de mandar a mensagem —
// reaproveitado por enviar-lembretes, enviar-aniversarios e
// lembrete-28-dias (todo lembrete que precisa disparar no máximo uma vez
// por agendamento/tipo). A unique constraint (agendamento_id, tipo) da
// tabela garante que, se dois runs do cron pegarem o mesmo lembrete, só o
// primeiro insert vinga — o segundo recebe 23505 (unique_violation) e a
// mensagem não é reenviada.
//
// Tradeoff aceito: se o envio falhar DEPOIS do insert ter vingado, o
// lembrete fica marcado como enviado sem ter sido de fato. Evitar WhatsApp
// duplicado pro cliente importa mais aqui do que garantir 100% de entrega, e
// a falha aparece no retorno da function (visível nos logs) pra Gisele notar
// manualmente se precisar reenviar.
//
// notificar-agendamento (confirmação/cancelamento, disparada por trigger de
// INSERT/UPDATE) NÃO usa isto: lá o próprio Postgres já garante "uma vez por
// evento", e confirmação pode precisar sair mais de uma vez por agendamento
// (cada remarcação), o que essa unique constraint não permite.

import { enviarWhatsApp } from "./evolution.ts";
import { criarClienteAdmin } from "./supabase-admin.ts";

type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;

export type ResultadoLembrete = "enviado" | "ja_enviado" | "falha_envio";

export async function registraEEnvia(
  supabase: ClienteAdmin,
  params: {
    agendamentoId: string | null;
    clienteId: string | null;
    tipo: string;
    whatsapp: string;
    mensagem: string;
  },
): Promise<ResultadoLembrete> {
  const { error: insertError } = await supabase.from("lembretes_enviados").insert({
    agendamento_id: params.agendamentoId,
    cliente_id: params.clienteId,
    tipo: params.tipo,
  });

  if (insertError) {
    if (insertError.code === "23505") return "ja_enviado";
    throw insertError;
  }

  try {
    await enviarWhatsApp(params.whatsapp, params.mensagem);
    return "enviado";
  } catch {
    return "falha_envio";
  }
}

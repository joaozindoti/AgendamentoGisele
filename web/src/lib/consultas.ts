import type { SupabaseClient } from "@supabase/supabase-js";

export async function lerConfigNumero(supabase: SupabaseClient, chave: string, padrao: number) {
  const { data } = await supabase.from("configuracoes").select("valor").eq("chave", chave).maybeSingle();
  const n = Number(data?.valor);
  return Number.isFinite(n) ? n : padrao;
}

// Colunas explícitas sempre: `telefone` de profissionais está fora do SELECT
// de anon/authenticated, então `profissionais(*)` daria "permission denied".
export const SELECT_AGENDAMENTO_CLIENTE =
  "id, periodo, status, canal, observacoes, servico_id, profissional_id, servico:servicos(nome, duracao_min), profissional:profissionais(nome, foto_url)";

export const SELECT_AGENDAMENTO_PAINEL =
  "id, periodo, status, canal, observacoes, cliente_id, servico_id, profissional_id, cliente:clientes(nome, whatsapp), servico:servicos(nome), profissional:profissionais(nome)";

export interface AgendamentoComDetalhes {
  id: string;
  periodo: string;
  status: "confirmado" | "cancelado" | "concluido" | "no_show";
  canal: string;
  observacoes: string | null;
  servico_id: string;
  profissional_id: string;
  cliente_id?: string;
  servico: { nome: string; duracao_min?: number } | null;
  profissional: { nome: string; foto_url?: string | null } | null;
  cliente?: { nome: string; whatsapp: string } | null;
}

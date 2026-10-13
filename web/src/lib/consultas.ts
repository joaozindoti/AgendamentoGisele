import type { SupabaseClient } from "@supabase/supabase-js";

export async function lerConfigNumero(supabase: SupabaseClient, chave: string, padrao: number) {
  const { data } = await supabase.from("configuracoes").select("valor").eq("chave", chave).maybeSingle();
  const n = Number(data?.valor);
  return Number.isFinite(n) ? n : padrao;
}

// Colunas explícitas sempre: `telefone` de profissionais está fora do SELECT
// de anon/authenticated, então `profissionais(*)` daria "permission denied".
export const SELECT_AGENDAMENTO_CLIENTE =
  "id, periodo, status, canal, observacoes, servico_id, profissional_id, servico:servicos(nome, duracao_min), itens:agendamento_servicos(ordem, duracao_min, preco, servico:servicos(id, nome)), profissional:profissionais(nome, foto_url)";

export const SELECT_AGENDAMENTO_PAINEL =
  "id, periodo, status, canal, observacoes, cliente_id, servico_id, profissional_id, cliente:clientes(nome, whatsapp, foto_url), servico:servicos(nome), itens:agendamento_servicos(ordem, duracao_min, preco, servico:servicos(id, nome)), profissional:profissionais(nome)";

export interface ItemAgendamento {
  ordem: number;
  duracao_min: number;
  preco: number | string | null;
  // PostgREST pode tipar o embed como objeto ou array; o helper normaliza.
  servico: { id: string; nome: string } | { id: string; nome: string }[] | null;
}

export interface ServicosDoAgendamento {
  nomes: string; // "Sobrancelha + Buço"
  lista: { id: string | null; nome: string; duracao_min: number | null; preco: number | null }[];
  duracaoTotal: number | null; // minutos; null se desconhecida
  precoTotal: number | null; // null se nenhum item tem preço
  precoParcial: boolean; // algum item sem preço e outro com: mostrar "+"
}

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
  itens?: ItemAgendamento[] | null;
  profissional: { nome: string; foto_url?: string | null } | null;
  cliente?: { nome: string; whatsapp: string; foto_url?: string | null } | null;
}

// Serviços de um agendamento, na ordem. Sem itens (agendamento antigo ou
// select sem o embed), cai para o servico único.
export function servicosDoAgendamento(
  ag: Pick<AgendamentoComDetalhes, "servico" | "itens">,
): ServicosDoAgendamento {
  const itens = [...(ag.itens ?? [])].sort((a, b) => a.ordem - b.ordem);
  const lista = itens.map((i) => {
    const s = Array.isArray(i.servico) ? i.servico[0] : i.servico;
    const preco = i.preco == null ? null : Number(i.preco);
    return {
      id: s?.id ?? null,
      nome: s?.nome ?? "Serviço",
      duracao_min: i.duracao_min ?? null,
      preco: preco != null && Number.isFinite(preco) ? preco : null,
    };
  });
  if (lista.length === 0) {
    const nome = ag.servico?.nome ?? "Serviço";
    const dur = ag.servico?.duracao_min ?? null;
    return { nomes: nome, lista: [{ id: null, nome, duracao_min: dur, preco: null }], duracaoTotal: dur, precoTotal: null, precoParcial: false };
  }
  const comPreco = lista.filter((i) => i.preco != null);
  return {
    nomes: lista.map((i) => i.nome).join(" + "),
    lista,
    duracaoTotal: lista.reduce((t, i) => t + (i.duracao_min ?? 0), 0),
    precoParcial: comPreco.length > 0 && comPreco.length < lista.length,
    precoTotal: comPreco.length ? comPreco.reduce((t, i) => t + (i.preco ?? 0), 0) : null,
  };
}

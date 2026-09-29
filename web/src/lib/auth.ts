import { redirect } from "next/navigation";
import { cache } from "react";
import { criarClienteServidor } from "./supabase/server";
import type { MeuPapel } from "./tipos";

// cache(): layout e página da mesma request compartilham a mesma leitura.
export const obterSessao = cache(async () => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  // sessão anônima = cliente que entrou sem login (signInAnonymously no
  // primeiro cadastro). Gisele e equipe entram por telefone e nunca são anônimas.
  const anonimo = data?.claims?.is_anonymous === true;
  if (!userId) return { supabase, userId: null, anonimo: false, papel: null };

  const { data: papel } = await supabase.rpc("meu_papel");
  return { supabase, userId, anonimo, papel: (papel ?? null) as MeuPapel | null };
});

// Área da cliente: aberta pra qualquer um (catálogo e horários são
// públicos). clienteId fica null até ela se cadastrar — o cadastro aparece
// no primeiro agendamento ou no Perfil, sem tela de login.
export async function obterAreaCliente() {
  const sessao = await obterSessao();
  // Profissional que nunca teve cadastro de cliente vai direto pro painel.
  if (!sessao.papel?.cliente_id && sessao.papel?.profissional_id) redirect("/painel");
  return { ...sessao, clienteId: sessao.papel?.cliente_id ?? null };
}

/** Páginas que só fazem sentido com cadastro (remarcar, salvar perfil). */
export async function exigirCliente() {
  const sessao = await obterAreaCliente();
  if (!sessao.clienteId) redirect("/cliente");
  return { ...sessao, clienteId: sessao.clienteId };
}

export async function exigirProfissional() {
  const sessao = await obterSessao();
  if (!sessao.userId || sessao.anonimo) redirect("/entrar?proximo=/painel");
  if (!sessao.papel?.profissional_id) redirect("/cliente");
  return {
    ...sessao,
    profissionalId: sessao.papel.profissional_id,
    ehOwner: sessao.papel.papel === "owner",
  };
}

export async function exigirOwner() {
  const sessao = await exigirProfissional();
  if (!sessao.ehOwner) redirect("/painel");
  return sessao;
}

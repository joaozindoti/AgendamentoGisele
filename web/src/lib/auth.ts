import { redirect } from "next/navigation";
import { cache } from "react";
import { criarClienteServidor } from "./supabase/server";
import type { MeuPapel } from "./tipos";

// cache(): layout e página da mesma request compartilham a mesma leitura.
export const obterSessao = cache(async () => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return { supabase, userId: null, papel: null };

  const { data: papel } = await supabase.rpc("meu_papel");
  return { supabase, userId, papel: (papel ?? null) as MeuPapel | null };
});

export async function exigirCliente() {
  const sessao = await obterSessao();
  if (!sessao.userId) redirect("/entrar?proximo=/cliente");
  // Profissional que nunca teve cadastro de cliente vai direto pro painel.
  if (!sessao.papel?.cliente_id) {
    if (sessao.papel?.profissional_id) redirect("/painel");
    redirect("/entrar?proximo=/cliente");
  }
  return { ...sessao, clienteId: sessao.papel.cliente_id };
}

export async function exigirProfissional() {
  const sessao = await obterSessao();
  if (!sessao.userId) redirect("/entrar?proximo=/painel");
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

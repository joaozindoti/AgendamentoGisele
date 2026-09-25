"use server";

import { revalidatePath } from "next/cache";
import { exigirCliente } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/erros";
import { chaveDia } from "@/lib/formato";
import { CONSENTIMENTO_VERSAO } from "@/lib/tipos";

export type EstadoForm = { ok?: boolean; erro?: string } | null;

export async function salvarPerfil(_: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const { supabase, clienteId } = await exigirCliente();

  const nome = String(dados.get("nome") ?? "").trim();
  const endereco = String(dados.get("endereco") ?? "").trim();
  const nascimento = String(dados.get("data_nascimento") ?? "");
  const consentimento = dados.get("consentimento") === "on";

  if (nome.length < 2 || nome.length > 100) return { erro: "Informe seu nome." };
  if (nascimento && (nascimento < "1900-01-01" || nascimento > chaveDia())) return { erro: "Data de nascimento inválida." };

  const { data: atual } = await supabase.from("clientes").select("consentimento").eq("id", clienteId).single();

  // consentimento_em é carimbado pelo trigger do banco quando o consentimento
  // passa a valer; aqui só registramos qual versão do texto foi aceita.
  const { error } = await supabase
    .from("clientes")
    .update({
      nome,
      endereco: endereco || null,
      data_nascimento: nascimento || null,
      consentimento,
      ...(consentimento && !atual?.consentimento ? { consentimento_versao: CONSENTIMENTO_VERSAO } : {}),
    })
    .eq("id", clienteId);

  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/cliente", "layout");
  return { ok: true };
}

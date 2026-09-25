"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirOwner, exigirProfissional } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/erros";
import { instanteLocal } from "@/lib/formato";
import { paraE164 } from "@/lib/telefone";
import { CHAVES_CONFIG, type StatusAgendamento } from "@/lib/tipos";

// Server Actions do painel. Toda escrita vai com a sessão da pessoa logada,
// então quem pode o quê continua sendo decidido pela RLS/triggers no banco
// (seção 4). exigirOwner/exigirProfissional aqui só evitam round-trip inútil
// e dão mensagem clara — não são a barreira de segurança.

export type Estado = { ok?: boolean; erro?: string } | null;

const texto = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const numeroOuNull = (d: FormData, k: string) => {
  const v = texto(d, k).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// ---------- agendamentos ----------

export async function mudarStatus(id: string, status: StatusAgendamento): Promise<Estado & object> {
  const { supabase } = await exigirProfissional();
  const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id);
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/painel", "layout");
  return { ok: true };
}

export async function remarcarPainel(id: string, inicioIso: string): Promise<Estado & object> {
  const { supabase } = await exigirProfissional();
  const { error } = await supabase.rpc("remarcar", { p_agendamento_id: id, p_novo_inicio: inicioIso });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/painel", "layout");
  return { ok: true };
}

export async function salvarObservacoes(id: string, _: Estado, dados: FormData): Promise<Estado> {
  const { supabase } = await exigirProfissional();
  const { error } = await supabase
    .from("agendamentos")
    .update({ observacoes: texto(dados, "observacoes") || null })
    .eq("id", id);
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath(`/painel/agendamentos/${id}`);
  return { ok: true };
}

export async function agendarPainel(params: {
  clienteId: string | null;
  novoNome?: string;
  novoWhatsapp?: string;
  profissionalId: string;
  servicoId: string;
  inicioIso: string;
  observacoes?: string;
}): Promise<{ ok?: boolean; erro?: string; id?: string }> {
  const { supabase } = await exigirProfissional();

  let clienteId = params.clienteId;
  if (!clienteId) {
    const e164 = paraE164(params.novoWhatsapp ?? "");
    if (!e164) return { erro: "WhatsApp da cliente inválido." };
    const { data, error } = await supabase.rpc("obter_ou_criar_cliente", {
      p_nome: params.novoNome ?? "",
      p_whatsapp: e164,
    });
    if (error || !data) return { erro: mensagemDeErro(error) };
    clienteId = data as string;
  }

  const { data: id, error } = await supabase.rpc("agendar", {
    p_profissional_id: params.profissionalId,
    p_servico_id: params.servicoId,
    p_inicio: params.inicioIso,
    p_cliente_id: clienteId,
    p_observacoes: params.observacoes || null,
  });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/painel", "layout");
  return { ok: true, id: id as string };
}

// ---------- clientes (owner) ----------

export async function salvarCliente(id: string | null, _: Estado, dados: FormData): Promise<Estado> {
  const { supabase } = await exigirOwner();
  const nome = texto(dados, "nome");
  const whatsapp = paraE164(texto(dados, "whatsapp"));
  if (nome.length < 2) return { erro: "Informe o nome." };
  if (!whatsapp) return { erro: "WhatsApp inválido. Use DDD + número." };

  const registro = {
    nome,
    whatsapp,
    endereco: texto(dados, "endereco") || null,
    data_nascimento: texto(dados, "data_nascimento") || null,
  };

  const { data, error } = id
    ? await supabase.from("clientes").update(registro).eq("id", id).select("id").single()
    : await supabase.from("clientes").insert(registro).select("id").single();
  if (error) return { erro: mensagemDeErro(error) };

  revalidatePath("/painel/clientes", "layout");
  if (!id) redirect(`/painel/clientes/${data.id}`);
  return { ok: true };
}

// ---------- equipe (owner) ----------

export async function salvarProfissional(id: string | null, _: Estado, dados: FormData): Promise<Estado> {
  const { supabase, profissionalId } = await exigirOwner();
  const nome = texto(dados, "nome");
  const telefoneBruto = texto(dados, "telefone");
  const telefone = telefoneBruto ? paraE164(telefoneBruto) : null;
  if (nome.length < 2) return { erro: "Informe o nome." };
  if (telefoneBruto && !telefone) return { erro: "Celular inválido. Use DDD + número." };

  const papel = texto(dados, "papel") === "owner" ? "owner" : "staff";
  const ativo = dados.get("ativo") === "on";
  if (id === profissionalId && (!ativo || papel !== "owner")) {
    return { erro: "Você não pode desativar nem rebaixar o seu próprio acesso." };
  }

  const registro = { nome, telefone, bio: texto(dados, "bio") || null, papel, ativo };
  const { data, error } = id
    ? await supabase.from("profissionais").update(registro).eq("id", id).select("id").single()
    : await supabase.from("profissionais").insert(registro).select("id").single();
  if (error) return { erro: mensagemDeErro(error) };

  revalidatePath("/painel/equipe", "layout");
  if (!id) redirect(`/painel/equipe/${data.id}`);
  return { ok: true };
}

export async function salvarServicosDaProfissional(profissionalId: string, _: Estado, dados: FormData): Promise<Estado> {
  const { supabase } = await exigirOwner();
  const escolhidos = dados.getAll("servico").map(String);

  const linhas = [];
  for (const servicoId of escolhidos) {
    const preco = numeroOuNull(dados, `preco_${servicoId}`);
    const dur = numeroOuNull(dados, `duracao_${servicoId}`);
    if (Number.isNaN(preco) || Number.isNaN(dur) || (dur !== null && (dur <= 0 || !Number.isInteger(dur)))) {
      return { erro: "Preço ou duração em formato inválido." };
    }
    linhas.push({ profissional_id: profissionalId, servico_id: servicoId, preco_override: preco, duracao_override_min: dur });
  }

  const { error: erroApagar } = await supabase
    .from("profissional_servicos")
    .delete()
    .eq("profissional_id", profissionalId)
    .not("servico_id", "in", `(${escolhidos.length ? escolhidos.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  if (erroApagar) return { erro: mensagemDeErro(erroApagar) };

  if (linhas.length) {
    const { error } = await supabase.from("profissional_servicos").upsert(linhas, { onConflict: "profissional_id,servico_id" });
    if (error) return { erro: mensagemDeErro(error) };
  }

  revalidatePath(`/painel/equipe/${profissionalId}`);
  return { ok: true };
}

// ---------- serviços (owner) ----------

export async function salvarServico(id: string | null, _: Estado, dados: FormData): Promise<Estado> {
  const { supabase } = await exigirOwner();
  const nome = texto(dados, "nome");
  const preco = numeroOuNull(dados, "preco");
  const duracao = numeroOuNull(dados, "duracao_min");
  if (nome.length < 2) return { erro: "Informe o nome do serviço." };
  if (Number.isNaN(preco) || (preco !== null && preco < 0)) return { erro: "Preço inválido." };
  if (!duracao || Number.isNaN(duracao) || duracao <= 0 || !Number.isInteger(duracao)) {
    return { erro: "Duração deve ser um número inteiro de minutos." };
  }

  const registro = {
    nome,
    descricao: texto(dados, "descricao") || null,
    preco,
    duracao_min: duracao,
    categoria: texto(dados, "categoria") || null,
    destaque: dados.get("destaque") === "on",
    ativo: dados.get("ativo") === "on",
  };

  const { data, error } = id
    ? await supabase.from("servicos").update(registro).eq("id", id).select("id").single()
    : await supabase.from("servicos").insert(registro).select("id").single();
  if (error) return { erro: mensagemDeErro(error) };

  const servicoId = data.id as string;
  const profissionais = dados.getAll("profissional").map(String);
  await supabase
    .from("profissional_servicos")
    .delete()
    .eq("servico_id", servicoId)
    .not("profissional_id", "in", `(${profissionais.length ? profissionais.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  if (profissionais.length) {
    const { error: erroVinculo } = await supabase
      .from("profissional_servicos")
      .upsert(
        profissionais.map((p) => ({ profissional_id: p, servico_id: servicoId })),
        { onConflict: "profissional_id,servico_id", ignoreDuplicates: true },
      );
    if (erroVinculo) return { erro: mensagemDeErro(erroVinculo) };
  }

  revalidatePath("/painel/servicos", "layout");
  revalidatePath("/servicos");
  if (!id) redirect(`/painel/servicos/${servicoId}`);
  return { ok: true };
}

// Foto já subiu pro Storage direto do navegador (policy de storage decide
// quem pode); aqui só grava a URL pública na linha.
export async function salvarFoto(tabela: "servicos" | "profissionais", id: string, url: string): Promise<Estado & object> {
  const { supabase } = await exigirProfissional();
  const { error } = await supabase.from(tabela).update({ foto_url: url }).eq("id", id);
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/painel", "layout");
  revalidatePath("/servicos");
  return { ok: true };
}

// ---------- disponibilidade e bloqueios ----------

export async function adicionarJanela(profissionalId: string, _: Estado, dados: FormData): Promise<Estado> {
  const { supabase } = await exigirProfissional();
  const dia = Number(dados.get("dia_semana"));
  const inicio = texto(dados, "hora_inicio");
  const fim = texto(dados, "hora_fim");
  if (!(dia >= 0 && dia <= 6) || !inicio || !fim) return { erro: "Preencha dia, início e fim." };
  if (fim <= inicio) return { erro: "O fim precisa ser depois do início." };

  const { error } = await supabase
    .from("disponibilidade_profissional")
    .insert({ profissional_id: profissionalId, dia_semana: dia, hora_inicio: inicio, hora_fim: fim });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/painel", "layout");
  return { ok: true };
}

export async function removerJanela(id: string) {
  const { supabase } = await exigirProfissional();
  await supabase.from("disponibilidade_profissional").delete().eq("id", id);
  revalidatePath("/painel", "layout");
}

export async function adicionarBloqueio(profissionalId: string, _: Estado, dados: FormData): Promise<Estado> {
  const { supabase } = await exigirProfissional();
  const diaInicio = texto(dados, "dia_inicio");
  const diaFim = texto(dados, "dia_fim") || diaInicio;
  const horaInicio = texto(dados, "hora_inicio") || "00:00";
  const horaFim = texto(dados, "hora_fim") || "23:59";
  if (!diaInicio) return { erro: "Escolha o dia." };

  const inicio = instanteLocal(diaInicio, horaInicio);
  const fim = instanteLocal(diaFim, horaFim);
  if (fim <= inicio) return { erro: "O fim precisa ser depois do início." };

  const { error } = await supabase.from("bloqueios_agenda").insert({
    profissional_id: profissionalId,
    periodo: `[${inicio.toISOString()},${fim.toISOString()})`,
    motivo: texto(dados, "motivo") || null,
  });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/painel", "layout");
  return { ok: true };
}

export async function removerBloqueio(id: string) {
  const { supabase } = await exigirProfissional();
  await supabase.from("bloqueios_agenda").delete().eq("id", id);
  revalidatePath("/painel", "layout");
}

// ---------- configurações (owner) ----------

export async function salvarConfiguracoes(_: Estado, dados: FormData): Promise<Estado> {
  const { supabase } = await exigirOwner();
  const linhas = [];
  for (const chave of CHAVES_CONFIG) {
    const n = Number(texto(dados, chave));
    if (!Number.isInteger(n) || n < 0 || n > 365) return { erro: "Use números inteiros entre 0 e 365." };
    if (chave === "passo_minutos" && (n < 5 || n > 120)) return { erro: "A grade precisa ficar entre 5 e 120 minutos." };
    linhas.push({ chave, valor: n });
  }
  const { error } = await supabase.from("configuracoes").upsert(linhas, { onConflict: "chave" });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- perfil da própria profissional ----------

export async function salvarMeuPerfil(_: Estado, dados: FormData): Promise<Estado> {
  const { supabase, profissionalId } = await exigirProfissional();
  const nome = texto(dados, "nome");
  if (nome.length < 2) return { erro: "Informe seu nome." };
  const { error } = await supabase
    .from("profissionais")
    .update({ nome, bio: texto(dados, "bio") || null })
    .eq("id", profissionalId);
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/painel", "layout");
  return { ok: true };
}

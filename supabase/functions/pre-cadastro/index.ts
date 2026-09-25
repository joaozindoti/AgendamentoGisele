// Fase 1 — substitui a policy de insert anônimo em `clientes`. O formulário
// público de pré-cadastro chama esta função em vez de escrever direto na
// tabela: aqui o payload é validado, o rate limit por IP e por telefone é
// aplicado (tabela pre_cadastro_tentativas), e só então o insert acontece
// via service role (a única forma de escrever em `clientes` sem sessão).
//
// Segredos (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) vêm das variáveis de
// ambiente padrão injetadas pelo runtime — nunca hardcoded.

import { createClient } from "npm:@supabase/supabase-js@2";

const LIMITE_POR_IP_1H = 10;
const LIMITE_POR_TELEFONE_24H = 3;

const E164 = /^\+[1-9]\d{7,14}$/;

function validaPayload(body: unknown) {
  if (typeof body !== "object" || body === null) return "payload inválido";
  const b = body as Record<string, unknown>;

  if (typeof b.nome !== "string" || b.nome.trim().length < 2 || b.nome.trim().length > 100) {
    return "nome inválido";
  }
  if (typeof b.whatsapp !== "string" || !E164.test(b.whatsapp.trim())) {
    return "whatsapp inválido (formato esperado: +5599988887777)";
  }
  if (b.consentimento !== true) {
    return "consentimento é obrigatório";
  }
  if (b.endereco !== undefined && b.endereco !== null && typeof b.endereco !== "string") {
    return "endereco inválido";
  }
  if (b.data_nascimento !== undefined && b.data_nascimento !== null) {
    if (typeof b.data_nascimento !== "string" || isNaN(Date.parse(b.data_nascimento))) {
      return "data_nascimento inválida";
    }
  }
  return null;
}

// O formulário do app (web/, Next.js) chama esta função direto do
// navegador — é o que preserva o IP real da cliente pro rate limit. Sem os
// headers de CORS (e sem responder o preflight OPTIONS), o navegador
// bloqueia a chamada antes dela chegar aqui. Origem aberta de propósito: o
// endpoint já é público por natureza; a proteção dele é o rate limit e o
// insert-only, não a origem.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(corpo: unknown, status: number) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return responder({ error: "method_not_allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return responder({ error: "json_invalido" }, 400);
  }

  const erro = validaPayload(body);
  if (erro) {
    return responder({ error: erro }, 400);
  }

  const b = body as {
    nome: string;
    whatsapp: string;
    endereco?: string;
    data_nascimento?: string;
    consentimento: boolean;
  };

  const nome = b.nome.trim();
  const whatsapp = b.whatsapp.trim();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "desconhecido";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [porIp, porTelefone] = await Promise.all([
    supabase
      .from("pre_cadastro_tentativas")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("criado_em", umaHoraAtras),
    supabase
      .from("pre_cadastro_tentativas")
      .select("id", { count: "exact", head: true })
      .eq("telefone", whatsapp)
      .gte("criado_em", vinteQuatroHorasAtras),
  ]);

  if ((porIp.count ?? 0) >= LIMITE_POR_IP_1H || (porTelefone.count ?? 0) >= LIMITE_POR_TELEFONE_24H) {
    return responder({ error: "muitas_tentativas" }, 429);
  }

  await supabase.from("pre_cadastro_tentativas").insert({ ip, telefone: whatsapp });

  // consentimento_versao fixo por enquanto — trocar quando o texto de
  // consentimento mudar de verdade (não existe tela de "aceitar nova
  // versão" nesta fase, então isso é só o registro do que valia quando
  // cada cliente se cadastrou).
  const CONSENTIMENTO_VERSAO = "v1-25092026";

  // Insert-only, nunca upsert: isto é um endpoint público e sem
  // autenticação (verify_jwt = true só exige a anon key, que é pública por
  // design — não prova quem está do outro lado). Um upsert por whatsapp
  // deixaria qualquer um sobrescrever nome/endereço/data de nascimento de
  // um cliente já cadastrado só sabendo o número dele; o rate limit acima
  // não protege isso porque basta 1 request. Conflito (23505) = telefone já
  // cadastrado, tratado como sucesso sem mexer na linha existente; corrigir
  // dado errado de um cadastro anterior é coisa pra tela de perfil
  // autenticada (seção 7), não pra este formulário público.
  const { error: insertError } = await supabase.from("clientes").insert({
    nome,
    whatsapp,
    endereco: b.endereco ?? null,
    data_nascimento: b.data_nascimento ?? null,
    consentimento: true,
    consentimento_em: new Date().toISOString(),
    consentimento_versao: CONSENTIMENTO_VERSAO,
  });

  if (insertError && insertError.code !== "23505") {
    return responder({ error: "falha_ao_salvar", detail: insertError.message }, 500);
  }

  return responder({ ok: true }, 200);
});

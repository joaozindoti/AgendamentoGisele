-- Resposta automática a mensagem recebida no WhatsApp do studio (fase 17).
-- Substitui o workflow "Agente" do n8n: a Edge Function responder-whatsapp
-- recebe o webhook de mensagem da Evolution API e responde só pedido de
-- link/app e pergunta sobre público masculino. Curso fica em silêncio; o
-- resto não é respondido e vai pra mensagens_nao_classificadas.
--
-- Não tem secret dentro e é idempotente: pode colar de novo sem erro.

-- =============================================================
-- 1. Mensagens que ficaram sem resposta automática
-- =============================================================
-- mensagem_id é o id da mensagem no WhatsApp: a Evolution API pode entregar
-- o mesmo webhook mais de uma vez, e isso não pode virar linha repetida.
create table if not exists mensagens_nao_classificadas (
  id uuid primary key default uuid_generate_v4(),
  telefone text not null,
  nome text,
  texto text not null,
  mensagem_id text unique,
  recebida_em timestamptz not null default now()
);
create index if not exists mensagens_nao_classificadas_recebida_idx on mensagens_nao_classificadas (recebida_em desc);

alter table mensagens_nao_classificadas enable row level security;
drop policy if exists "owner_le_mensagens_nao_classificadas" on mensagens_nao_classificadas;
create policy "owner_le_mensagens_nao_classificadas" on mensagens_nao_classificadas
  for select using (public.eh_owner());

-- =============================================================
-- 2. Cooldown das respostas automáticas
-- =============================================================
-- Uma linha por número: a última resposta automática (link ou aviso de
-- público feminino). Só a função mexe aqui (service role); sem policy,
-- ninguém do app lê nem escreve.
create table if not exists respostas_automaticas (
  telefone text primary key,
  categoria text not null,
  respondido_em timestamptz not null default now()
);

alter table respostas_automaticas enable row level security;

-- Reivindica o direito de responder: true = pode mandar (e já fica
-- registrado), false = esse número recebeu resposta automática há menos de
-- p_cooldown_minutos. Um comando só (insert ... on conflict ... where), então
-- duas mensagens chegando juntas do mesmo número não geram duas respostas.
-- Mesmo tradeoff de registraEEnvia: marca antes de enviar; se o envio
-- falhar, o número fica sem resposta até o cooldown passar, mas nunca recebe
-- duplicada.
create or replace function public.reivindicar_resposta_automatica(
  p_telefone text,
  p_categoria text,
  p_cooldown_minutos int default 10
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into respostas_automaticas (telefone, categoria, respondido_em)
  values (p_telefone, p_categoria, now())
  on conflict (telefone) do update
    set categoria = excluded.categoria, respondido_em = excluded.respondido_em
    where respostas_automaticas.respondido_em <= now() - make_interval(mins => p_cooldown_minutos)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.reivindicar_resposta_automatica(text, text, int) from public, anon, authenticated;
grant execute on function public.reivindicar_resposta_automatica(text, text, int) to service_role;

-- Alerta no WhatsApp da Gisele quando uma mensagem cai em
-- mensagens_nao_classificadas (fase 18). A função responder-whatsapp manda o
-- alerta; aqui fica só o cooldown dele.
--
-- Cooldown separado do das respostas automáticas (respostas_automaticas) de
-- propósito: a cliente que recebeu o link e logo depois mandou uma pergunta
-- que a automação não entende PRECISA gerar alerta. O que o cooldown evita é
-- a Gisele receber um alerta por mensagem quando a mesma pessoa manda
-- várias seguidas.
--
-- Não tem secret dentro e é idempotente: pode colar de novo sem erro.

create table if not exists alertas_mensagem_nao_classificada (
  telefone text primary key,
  alertado_em timestamptz not null default now()
);

-- Só a função mexe aqui (service role); sem policy, o app não lê nem escreve.
alter table alertas_mensagem_nao_classificada enable row level security;

-- Mesmo desenho de reivindicar_resposta_automatica (migration
-- 20260930150000): um comando só, true = pode alertar (e já fica
-- registrado), false = já houve alerta desse número há menos de
-- p_cooldown_minutos.
create or replace function public.reivindicar_alerta_gisele(
  p_telefone text,
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
  insert into alertas_mensagem_nao_classificada (telefone, alertado_em)
  values (p_telefone, now())
  on conflict (telefone) do update
    set alertado_em = excluded.alertado_em
    where alertas_mensagem_nao_classificada.alertado_em <= now() - make_interval(mins => p_cooldown_minutos)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.reivindicar_alerta_gisele(text, int) from public, anon, authenticated;
grant execute on function public.reivindicar_alerta_gisele(text, int) to service_role;

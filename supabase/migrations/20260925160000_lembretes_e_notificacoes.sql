-- Studio Gisele Lima 2.0 — funções de apoio, pg_cron e trigger de
-- notificação para as Edge Functions da seção 6 (substituição do n8n).
-- Referência: studio-gisele-2.0-arquitetura.md, seções 6 e 14 (fase 1, item 3).

-- =============================================================
-- 1. Extensões
-- =============================================================
-- Forma documentada pelo Supabase pra habilitar por SQL (pg_cron no
-- pg_catalog, pg_net no schema extensions — as funções continuam em
-- cron.* e net.*). Se der erro de permissão, habilitar as duas em
-- Database → Extensions no dashboard e rodar este arquivo de novo.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- =============================================================
-- 2. Configurações novas (chaves ajustáveis pela Gisele, tabela já existe)
-- =============================================================
insert into configuracoes (chave, valor) values
  ('dias_lembrete_pos_procedimento', '28')
on conflict (chave) do nothing;

-- =============================================================
-- 3. RPCs de leitura usadas pelas Edge Functions de lembrete/aviso.
--    security definer porque as functions chamam com a service role, mas
--    QUALQUER função nova em `public` nasce com EXECUTE liberado pra
--    PUBLIC por padrão — sem o revoke/grant abaixo, um client anon ou
--    authenticated conseguiria chamar isso via /rpc/<nome> e ler agenda,
--    telefone e nome de clientes que não são dele. Mesmo cuidado de IDOR já
--    aplicado nas policies da migration anterior, agora pra funções.
-- =============================================================

create or replace function public.lembretes_pendentes(
  p_tipo text,
  p_horas_alvo numeric,
  p_margem_minutos int default 10
)
returns table (
  agendamento_id uuid,
  inicio timestamptz,
  cliente_id uuid,
  cliente_nome text,
  cliente_whatsapp text,
  servico_nome text,
  profissional_nome text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    lower(a.periodo),
    c.id,
    c.nome,
    c.whatsapp,
    s.nome,
    p.nome
  from agendamentos a
  join clientes c on c.id = a.cliente_id
  join servicos s on s.id = a.servico_id
  join profissionais p on p.id = a.profissional_id
  where a.status = 'confirmado'
    and lower(a.periodo) between
      now() + (p_horas_alvo * 60 - p_margem_minutos) * interval '1 minute'
      and now() + (p_horas_alvo * 60 + p_margem_minutos) * interval '1 minute'
    and not exists (
      select 1 from lembretes_enviados le
      where le.agendamento_id = a.id and le.tipo = p_tipo
    );
$$;

revoke all on function public.lembretes_pendentes(text, numeric, int) from public, anon, authenticated;
grant execute on function public.lembretes_pendentes(text, numeric, int) to service_role;

-- aniversario não tem agendamento_id (não está ligado a uma reserva
-- específica), então a unique constraint (agendamento_id, tipo) de
-- lembretes_enviados não serve pra dedupe aqui (NULL nunca é igual a NULL
-- numa unique constraint). O filtro "já mandou hoje" é feito aqui dentro,
-- por cliente_id + tipo + dia.
create or replace function public.aniversariantes_pendentes()
returns table (cliente_id uuid, nome text, whatsapp text)
language sql
security definer
set search_path = public
as $$
  select c.id, c.nome, c.whatsapp
  from clientes c
  where c.data_nascimento is not null
    and extract(month from c.data_nascimento) = extract(month from (now() at time zone 'America/Fortaleza'))
    and extract(day from c.data_nascimento) = extract(day from (now() at time zone 'America/Fortaleza'))
    and not exists (
      select 1 from lembretes_enviados le
      where le.cliente_id = c.id
        and le.tipo = 'aniversario'
        and (le.enviado_em at time zone 'America/Fortaleza')::date = (now() at time zone 'America/Fortaleza')::date
    );
$$;

revoke all on function public.aniversariantes_pendentes() from public, anon, authenticated;
grant execute on function public.aniversariantes_pendentes() to service_role;

create or replace function public.concluidos_para_lembrete_pos_procedimento()
returns table (
  agendamento_id uuid,
  cliente_id uuid,
  cliente_nome text,
  cliente_whatsapp text,
  servico_nome text
)
language sql
security definer
set search_path = public
as $$
  select a.id, c.id, c.nome, c.whatsapp, s.nome
  from agendamentos a
  join clientes c on c.id = a.cliente_id
  join servicos s on s.id = a.servico_id
  where a.status = 'concluido'
    and (upper(a.periodo) at time zone 'America/Fortaleza')::date =
        (now() at time zone 'America/Fortaleza')::date - (
          select (valor #>> '{}')::int from configuracoes where chave = 'dias_lembrete_pos_procedimento'
        )
    and not exists (
      select 1 from lembretes_enviados le
      where le.agendamento_id = a.id and le.tipo = '28dias'
    );
$$;

revoke all on function public.concluidos_para_lembrete_pos_procedimento() from public, anon, authenticated;
grant execute on function public.concluidos_para_lembrete_pos_procedimento() to service_role;

-- =============================================================
-- 4. Trigger de notificação (seção 6: notificar-agendamento)
-- =============================================================
-- Mesmo mecanismo de Database Webhook já usado em on_foto_uploaded
-- (migration 20260925153806, seção 7): supabase_functions.http_request
-- envia {type, table, schema, record, old_record} no body — NÃO as colunas
-- soltas na raiz. Confirmado contra a documentação oficial do Supabase
-- nesta sessão porque validar-foto tinha esse exato bug (lia a raiz em vez
-- de `record`, corrigido agora também).
--
-- ANTES DE RODAR ESTA MIGRATION: gere um secret novo (ex: `openssl rand
-- -hex 32`) e troque '<COLE_O_WEBHOOK_NOTIFICAR_SECRET_AQUI>' abaixo por
-- esse valor; depois configure o mesmo valor com:
--   supabase secrets set WEBHOOK_NOTIFICAR_AGENDAMENTO_SECRET=<mesmo valor>
create trigger on_agendamento_notificar
  after insert or update on agendamentos
  for each row
  execute function supabase_functions.http_request(
    'https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/notificar-agendamento',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<COLE_O_WEBHOOK_NOTIFICAR_SECRET_AQUI>"}',
    '{}',
    '5000'
  );

-- =============================================================
-- 5. pg_cron — agenda as Edge Functions de lembrete/aviso (seção 6)
-- =============================================================
-- O secret abaixo autentica a chamada do cron contra cada function (mesmo
-- padrão de x-webhook-secret/x-cron-secret já usado no resto do projeto).
--
-- ANTES DE RODAR ESTA MIGRATION: gere um valor (ex: `openssl rand -hex 32`),
-- troque '<COLE_O_CRON_SECRET_AQUI>' abaixo por esse valor em TODAS as
-- ocorrências, e configure o MESMO valor em CADA UMA das 3 functions
-- agendadas com:
--   supabase secrets set CRON_SECRET=<mesmo valor>
--
-- Horários abaixo assumem America/Fortaleza (Pedreiras - MA, ver
-- js/utils.js), UTC-3 sem horário de verão desde 2019 — se isso mudar, os
-- horários em UTC abaixo precisam ser recalculados.

select cron.schedule(
  'enviar-lembretes-15min',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/enviar-lembretes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<COLE_O_CRON_SECRET_AQUI>'),
    body := '{}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'enviar-aniversarios-diario',
  '0 12 * * *', -- 12:00 UTC = 09:00 em America/Fortaleza
  $cron$
  select net.http_post(
    url := 'https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/enviar-aniversarios',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<COLE_O_CRON_SECRET_AQUI>'),
    body := '{}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'lembrete-28-dias-diario',
  '0 13 * * *', -- 13:00 UTC = 10:00 em America/Fortaleza
  $cron$
  select net.http_post(
    url := 'https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/lembrete-28-dias',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<COLE_O_CRON_SECRET_AQUI>'),
    body := '{}'::jsonb
  );
  $cron$
);

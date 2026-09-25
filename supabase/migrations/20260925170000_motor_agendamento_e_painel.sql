-- Studio Gisele Lima 2.0 — motor de agendamento (seção 5), RPCs usadas pelo
-- app da cliente (seção 7), pelo painel (seção 8) e métricas (seção 10).
-- Referência: studio-gisele-2.0-arquitetura.md, seções 5, 7, 8, 10 e 14
-- (fases 5 a 8).
--
-- Fuso: America/Fortaleza (Pedreiras - MA), mesmo das migrations anteriores.

-- =============================================================
-- 1. Colunas de apresentação do catálogo
-- =============================================================
-- O catálogo atual (js/services.js) e os mockups filtram por categoria e
-- destacam serviços premium com selo dourado (seção 9: gold é pra "selo de
-- destaque"). O schema da seção 3 não tinha onde guardar isso; as duas
-- colunas são aditivas e opcionais, não mudam nenhuma regra existente.
alter table servicos add column categoria text;
alter table servicos add column destaque boolean not null default false;

-- =============================================================
-- 2. Configurações do motor (ajustáveis pela Gisele no painel)
-- =============================================================
insert into configuracoes (chave, valor) values
  ('passo_minutos', '30'),            -- grade de horários (commit bc66d47: grade de 30min)
  ('dias_maximos_agendamento', '60')  -- até quantos dias à frente a cliente pode marcar
on conflict (chave) do nothing;

create or replace function public.config_int(p_chave text, p_padrao int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (valor #>> '{}')::int from configuracoes where chave = p_chave), p_padrao);
$$;

-- =============================================================
-- 3. Duração e preço efetivos (override de profissional_servicos > serviço)
-- =============================================================
create or replace function public.duracao_efetiva(p_profissional_id uuid, p_servico_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(ps.duracao_override_min, s.duracao_min)
  from profissional_servicos ps
  join servicos s on s.id = ps.servico_id
  where ps.profissional_id = p_profissional_id and ps.servico_id = p_servico_id;
$$;

create or replace function public.preco_efetivo(p_profissional_id uuid, p_servico_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(ps.preco_override, s.preco)
  from profissional_servicos ps
  join servicos s on s.id = ps.servico_id
  where ps.profissional_id = p_profissional_id and ps.servico_id = p_servico_id;
$$;

-- =============================================================
-- 4. Motor de agendamento (seção 5)
-- =============================================================
-- Entrada: profissional, serviço, data. Devolve os inícios possíveis:
-- janela de disponibilidade do dia da semana, menos bloqueios, menos
-- agendamentos confirmados, em passos de `passo_minutos`, só no futuro.
-- security definer porque a cliente não enxerga agendamento de outra
-- cliente nem bloqueio por RLS — e precisa saber que o horário está
-- ocupado. Só devolve horários, nenhum dado de quem ocupa.
--
-- p_ignorar_agendamento_id: na remarcação, o próprio agendamento não pode
-- contar como "ocupando" o horário que a cliente quer manter/mover.
create or replace function public.horarios_disponiveis(
  p_profissional_id uuid,
  p_servico_id uuid,
  p_data date,
  p_ignorar_agendamento_id uuid default null
)
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duracao int;
  v_passo int;
  v_janela record;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_fim_janela timestamptz;
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  if not exists (select 1 from profissionais where id = p_profissional_id and ativo) then
    return;
  end if;
  if not exists (select 1 from servicos where id = p_servico_id and ativo) then
    return;
  end if;

  v_duracao := public.duracao_efetiva(p_profissional_id, p_servico_id);
  if v_duracao is null then
    return; -- essa profissional não faz esse serviço
  end if;

  if p_data < v_hoje or p_data > v_hoje + public.config_int('dias_maximos_agendamento', 60) then
    return;
  end if;

  v_passo := greatest(public.config_int('passo_minutos', 30), 5);

  for v_janela in
    select hora_inicio, hora_fim
    from disponibilidade_profissional
    where profissional_id = p_profissional_id
      and dia_semana = extract(dow from p_data)
    order by hora_inicio
  loop
    v_inicio := (p_data + v_janela.hora_inicio) at time zone 'America/Fortaleza';
    v_fim_janela := (p_data + v_janela.hora_fim) at time zone 'America/Fortaleza';

    while v_inicio + make_interval(mins => v_duracao) <= v_fim_janela loop
      v_fim := v_inicio + make_interval(mins => v_duracao);

      if v_inicio > now()
        and not exists (
          select 1 from bloqueios_agenda b
          where b.profissional_id = p_profissional_id
            and b.periodo && tstzrange(v_inicio, v_fim)
        )
        and not exists (
          select 1 from agendamentos a
          where a.profissional_id = p_profissional_id
            and a.status = 'confirmado'
            and a.periodo && tstzrange(v_inicio, v_fim)
            and a.id is distinct from p_ignorar_agendamento_id
        )
      then
        return next v_inicio;
      end if;

      v_inicio := v_inicio + make_interval(mins => v_passo);
    end loop;
  end loop;
end;
$$;

-- Dias com pelo menos um horário livre, pra calendário da tela de agendar
-- não deixar a cliente clicar em dia vazio.
create or replace function public.dias_disponiveis(
  p_profissional_id uuid,
  p_servico_id uuid,
  p_de date,
  p_ate date,
  p_ignorar_agendamento_id uuid default null
)
returns setof date
language sql
stable
security definer
set search_path = public
as $$
  select d::date
  from generate_series(p_de, least(p_ate, p_de + 62), interval '1 day') d
  where exists (
    select 1 from public.horarios_disponiveis(p_profissional_id, p_servico_id, d::date, p_ignorar_agendamento_id)
  );
$$;

-- Profissionais ativas que fazem um serviço, com preço/duração efetivos
-- (tela "escolher profissional" da seção 7). Não expõe telefone.
create or replace function public.profissionais_do_servico(p_servico_id uuid)
returns table (
  id uuid,
  nome text,
  bio text,
  foto_url text,
  preco numeric,
  duracao_min int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome, p.bio, p.foto_url,
         coalesce(ps.preco_override, s.preco),
         coalesce(ps.duracao_override_min, s.duracao_min)
  from profissional_servicos ps
  join profissionais p on p.id = ps.profissional_id
  join servicos s on s.id = ps.servico_id
  where ps.servico_id = p_servico_id and p.ativo and s.ativo
  order by p.papel, p.nome; -- owner ('owner' < 'staff' na ordem do enum) aparece primeiro
$$;

-- =============================================================
-- 5. Validação de horário no banco (seção 5 + seção 15)
-- =============================================================
-- A policy de insert/update da cliente só garante "é dela". Este trigger
-- garante que o horário é um dos que o motor ofereceria: cabe na
-- disponibilidade, não cai em bloqueio, duração bate com o serviço, está no
-- futuro. Sem isto, uma cliente chamando a API direto conseguiria marcar às
-- 3h da manhã ou num dia de folga.
--
-- Staff/owner (e service role) passam direto de propósito: no painel a
-- Gisele pode encaixar atendimento fora da grade. Sobreposição com outro
-- agendamento confirmado continua impossível pra todo mundo — isso é a
-- exclusion constraint, não este trigger.
--
-- As mensagens de erro são códigos curtos que o app traduz pra texto
-- legível (web/src/lib/erros.ts).
create or replace function public.valida_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duracao int;
begin
  if isempty(new.periodo) or lower_inf(new.periodo) or upper_inf(new.periodo) then
    raise exception 'periodo_invalido';
  end if;

  if auth.uid() is null
    or public.eh_owner()
    or new.profissional_id = public.meu_profissional_id()
  then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.periodo is not distinct from old.periodo then
    return new; -- cancelamento / edição de observação, horário não mudou
  end if;

  v_duracao := public.duracao_efetiva(new.profissional_id, new.servico_id);
  if v_duracao is null then
    raise exception 'servico_nao_oferecido';
  end if;

  if upper(new.periodo) <> lower(new.periodo) + make_interval(mins => v_duracao) then
    raise exception 'duracao_invalida';
  end if;

  if not exists (
    select 1
    from public.horarios_disponiveis(
      new.profissional_id,
      new.servico_id,
      (lower(new.periodo) at time zone 'America/Fortaleza')::date,
      case when tg_op = 'UPDATE' then new.id end
    ) h
    where h = lower(new.periodo)
  ) then
    raise exception 'horario_indisponivel';
  end if;

  return new;
end;
$$;

create trigger agendamentos_valida_horario
  before insert or update on agendamentos
  for each row execute function public.valida_agendamento();

-- Remarcou: os lembretes de 24h/1h do horário antigo já podem ter saído, e a
-- unique (agendamento_id, tipo) de lembretes_enviados impediria os do
-- horário novo. Apaga só esses dois tipos, só quando o período muda.
create or replace function public.reseta_lembretes_ao_remarcar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from lembretes_enviados
  where agendamento_id = new.id and tipo in ('24h', '1h');
  return null;
end;
$$;

create trigger agendamentos_reseta_lembretes
  after update of periodo on agendamentos
  for each row
  when (old.periodo is distinct from new.periodo)
  execute function public.reseta_lembretes_ao_remarcar();

-- =============================================================
-- 6. RPCs de escrita usadas pelo app e pelo painel
-- =============================================================
-- security INVOKER de propósito: rodam como o usuário logado, então RLS e
-- os triggers acima continuam valendo. O que elas fazem a mais é calcular o
-- fim do período pela duração efetiva no banco, em vez de confiar numa
-- duração mandada pelo client.

-- p_cliente_id nulo = a própria cliente logada marcando pelo app.
-- Preenchido = staff/owner marcando pelo painel em nome de alguém.
create or replace function public.agendar(
  p_profissional_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_cliente_id uuid default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_duracao int;
  v_cliente uuid := coalesce(p_cliente_id, public.meu_cliente_id());
  v_id uuid;
begin
  if v_cliente is null then
    raise exception 'cliente_nao_encontrada';
  end if;

  v_duracao := public.duracao_efetiva(p_profissional_id, p_servico_id);
  if v_duracao is null then
    raise exception 'servico_nao_oferecido';
  end if;

  insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, canal, observacoes)
  values (
    v_cliente,
    p_profissional_id,
    p_servico_id,
    tstzrange(p_inicio, p_inicio + make_interval(mins => v_duracao)),
    case when p_cliente_id is null then 'app' else 'painel' end,
    nullif(trim(p_observacoes), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.remarcar(p_agendamento_id uuid, p_novo_inicio timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ag record;
  v_duracao int;
begin
  select profissional_id, servico_id into v_ag
  from agendamentos where id = p_agendamento_id;

  if not found then
    raise exception 'agendamento_nao_encontrado';
  end if;

  v_duracao := coalesce(public.duracao_efetiva(v_ag.profissional_id, v_ag.servico_id),
                        (select duracao_min from servicos where id = v_ag.servico_id));

  update agendamentos
  set periodo = tstzrange(p_novo_inicio, p_novo_inicio + make_interval(mins => v_duracao))
  where id = p_agendamento_id;

  if not found then
    -- linha existe mas a policy de update não deixou (fora da janela mínima,
    -- já cancelada, ou não é dela)
    raise exception 'fora_da_janela_de_remarcacao';
  end if;
end;
$$;

create or replace function public.cancelar(p_agendamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update agendamentos set status = 'cancelado'
  where id = p_agendamento_id and status = 'confirmado';

  if not found then
    raise exception 'fora_da_janela_de_remarcacao';
  end if;
end;
$$;

-- Painel: staff/owner marcando pra alguém que ainda não tem cadastro, ou
-- que tem mas a staff ainda não enxerga (staff só vê cliente com quem já tem
-- agendamento). Devolve só o id; nunca sobrescreve dado de cliente que já
-- existia (mesmo cuidado do pre-cadastro contra sobrescrita por telefone).
create or replace function public.obter_ou_criar_cliente(p_nome text, p_whatsapp text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if public.meu_profissional_id() is null then
    raise exception 'apenas_profissionais';
  end if;
  if p_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'whatsapp_invalido';
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'nome_invalido';
  end if;

  insert into clientes (nome, whatsapp)
  values (trim(p_nome), p_whatsapp)
  on conflict (whatsapp) do nothing;

  select id into v_id from clientes where whatsapp = p_whatsapp;
  return v_id;
end;
$$;

-- Owner lê o telefone das profissionais (coluna fora do SELECT de
-- authenticated desde a migration 20260925153806).
create or replace function public.profissionais_admin()
returns table (
  id uuid,
  user_id uuid,
  nome text,
  telefone text,
  bio text,
  foto_url text,
  papel papel,
  ativo boolean,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.eh_owner() then
    raise exception 'apenas_owner';
  end if;

  return query
    select p.id, p.user_id, p.nome, p.telefone, p.bio, p.foto_url, p.papel, p.ativo, p.criado_em
    from profissionais p
    order by p.papel, p.nome;
end;
$$;

-- Quem sou eu no sistema — o app decide entre área da cliente e painel
-- com uma chamada só, sem precisar ler colunas restritas.
create or replace function public.meu_papel()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profissional_id', p.id,
    'papel', p.papel,
    'nome_profissional', p.nome,
    'cliente_id', public.meu_cliente_id()
  )
  from (select 1) x
  left join profissionais p on p.user_id = auth.uid() and p.ativo;
$$;

-- =============================================================
-- 7. Métricas (seção 10) — só owner
-- =============================================================
create or replace function public.metricas(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not public.eh_owner() then
    raise exception 'apenas_owner';
  end if;

  with base as (
    select
      a.id,
      a.cliente_id,
      a.status,
      (lower(a.periodo) at time zone 'America/Fortaleza')::date as dia,
      coalesce(ps.preco_override, s.preco) as preco,
      s.nome as servico_nome,
      p.nome as profissional_nome
    from agendamentos a
    join servicos s on s.id = a.servico_id
    join profissionais p on p.id = a.profissional_id
    left join profissional_servicos ps
      on ps.profissional_id = a.profissional_id and ps.servico_id = a.servico_id
    where (lower(a.periodo) at time zone 'America/Fortaleza')::date between p_inicio and p_fim
  ),
  validos as (
    select * from base where status <> 'cancelado'
  ),
  clientes_periodo as (
    select distinct cliente_id from validos
  ),
  historico as (
    select a.cliente_id,
           min((lower(a.periodo) at time zone 'America/Fortaleza')::date) as primeiro_dia,
           count(*) as total
    from agendamentos a
    where a.status <> 'cancelado'
      and (lower(a.periodo) at time zone 'America/Fortaleza')::date <= p_fim
      and a.cliente_id in (select cliente_id from clientes_periodo)
    group by a.cliente_id
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'total', (select count(*) from base),
    'por_status', (
      select coalesce(jsonb_object_agg(status::text, n), '{}'::jsonb)
      from (select status, count(*) as n from base group by status) x
    ),
    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', n) order by dia), '[]'::jsonb)
      from (select dia, count(*) as n from validos group by dia) x
    ),
    -- seção 10: no_show / total confirmado no período (confirmado =
    -- tudo que não foi cancelado: confirmado, concluido, no_show)
    'taxa_no_show', (
      select case when count(*) = 0 then null
             else round(count(*) filter (where status = 'no_show')::numeric / count(*), 4) end
      from validos
    ),
    'servicos_mais_agendados', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', servico_nome, 'total', n) order by n desc), '[]'::jsonb)
      from (select servico_nome, count(*) as n from validos group by servico_nome order by n desc limit 5) x
    ),
    'profissionais_mais_agendadas', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', profissional_nome, 'total', n) order by n desc), '[]'::jsonb)
      from (select profissional_nome, count(*) as n from validos group by profissional_nome order by n desc limit 5) x
    ),
    'receita_estimada', (
      select coalesce(sum(preco), 0) from base where status = 'concluido' and preco is not null
    ),
    'concluidos_sem_preco', (
      select count(*) from base where status = 'concluido' and preco is null
    ),
    'clientes_novas', (
      select count(*) from historico where primeiro_dia >= p_inicio
    ),
    'clientes_recorrentes', (
      select count(*) from historico where primeiro_dia < p_inicio
    ),
    'taxa_recorrencia', (
      select case when count(*) = 0 then null
             else round(count(*) filter (where total > 1)::numeric / count(*), 4) end
      from historico
    )
  )
  into v_resultado;

  return v_resultado;
end;
$$;

-- =============================================================
-- 8. Permissões das funções
-- =============================================================
-- Funções novas em `public` nascem com EXECUTE pra PUBLIC. Fecha tudo e
-- libera só o necessário, por papel.
revoke all on function public.config_int(text, int) from public, anon, authenticated;
revoke all on function public.duracao_efetiva(uuid, uuid) from public, anon, authenticated;
revoke all on function public.preco_efetivo(uuid, uuid) from public, anon, authenticated;
revoke all on function public.horarios_disponiveis(uuid, uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.dias_disponiveis(uuid, uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public.profissionais_do_servico(uuid) from public, anon, authenticated;
revoke all on function public.agendar(uuid, uuid, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.remarcar(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.cancelar(uuid) from public, anon, authenticated;
revoke all on function public.obter_ou_criar_cliente(text, text) from public, anon, authenticated;
revoke all on function public.profissionais_admin() from public, anon, authenticated;
revoke all on function public.meu_papel() from public, anon, authenticated;
revoke all on function public.metricas(date, date) from public, anon, authenticated;

-- leitura pública de disponibilidade (catálogo e calendário aparecem antes do login)
grant execute on function public.horarios_disponiveis(uuid, uuid, date, uuid) to anon, authenticated;
grant execute on function public.dias_disponiveis(uuid, uuid, date, date, uuid) to anon, authenticated;
grant execute on function public.profissionais_do_servico(uuid) to anon, authenticated;

-- só logado; cada uma confere papel por dentro ou roda sob RLS
grant execute on function public.agendar(uuid, uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.remarcar(uuid, timestamptz) to authenticated;
grant execute on function public.cancelar(uuid) to authenticated;
grant execute on function public.obter_ou_criar_cliente(text, text) to authenticated;
grant execute on function public.profissionais_admin() to authenticated;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.metricas(date, date) to authenticated;

-- as RPCs security invoker (agendar/remarcar) chamam estas por dentro com o
-- papel do usuário logado, então authenticated precisa de EXECUTE nelas.
grant execute on function public.duracao_efetiva(uuid, uuid) to authenticated;
grant execute on function public.config_int(text, int) to authenticated;

-- Fase 27: mais de um serviço por agendamento + corrigir o nome "Cliente".
--
-- 1. agendamento_servicos: um agendamento passa a ter 1..6 serviços, feitos em
--    sequência pela mesma profissional (período = soma das durações).
--    agendamentos.servico_id CONTINUA existindo e guarda o PRIMEIRO serviço:
--    importação, lembretes e código antigo seguem funcionando.
--    Cada linha guarda duração e preço da época (o faturamento não muda se a
--    Gisele reajustar o preço depois).
-- 2. horarios_disponiveis / dias_disponiveis / agendar ganham uma sobrecarga
--    com uuid[]; profissionais_dos_servicos é nova. As versões de serviço
--    único continuam e delegam às novas.
-- 3. Lembretes, protocolo pós, métricas e faturamento passam a considerar
--    todos os serviços (mesmas colunas de retorno de antes).
-- 4. obter_ou_criar_cliente troca o nome placeholder ("Cliente" / sem letra)
--    pelo nome informado; renomear_cliente é o caminho oficial para corrigir
--    o nome de uma cliente pelo painel.
--
-- Idempotente: pode rodar de novo sem erro.

-- =============================================================
-- 1. Tabela agendamento_servicos
-- =============================================================
create table if not exists agendamento_servicos (
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  servico_id uuid not null references servicos(id),
  ordem smallint not null check (ordem >= 1),
  duracao_min int not null check (duracao_min > 0),
  preco numeric(10,2), -- null = "consulte o valor"
  primary key (agendamento_id, ordem)
);
create index if not exists agendamento_servicos_servico_idx on agendamento_servicos (servico_id);

alter table agendamento_servicos enable row level security;

-- Lê quem pode ler o agendamento: o exists passa pela RLS de agendamentos
-- (cliente dona, staff dona do atendimento, owner). Escrita: nenhuma policy,
-- só o trigger/RPCs security definer abaixo.
drop policy if exists "le_servicos_do_agendamento" on agendamento_servicos;
create policy "le_servicos_do_agendamento" on agendamento_servicos
  for select using (exists (select 1 from agendamentos a where a.id = agendamento_servicos.agendamento_id));

revoke all on agendamento_servicos from public, anon, authenticated;
grant select on agendamento_servicos to authenticated;
grant select on agendamento_servicos to service_role;

-- Backfill: uma linha ordem = 1 para cada agendamento que já existe, com o
-- valor que o faturamento já calculava (preco_override da profissional, ou
-- servicos.preco) e a duração efetiva.
insert into agendamento_servicos (agendamento_id, servico_id, ordem, duracao_min, preco)
select a.id, a.servico_id, 1,
       coalesce(ps.duracao_override_min, s.duracao_min),
       coalesce(ps.preco_override, s.preco)
from agendamentos a
join servicos s on s.id = a.servico_id
left join profissional_servicos ps
  on ps.profissional_id = a.profissional_id and ps.servico_id = a.servico_id
on conflict (agendamento_id, ordem) do nothing;

-- =============================================================
-- 2. Funções de apoio
-- =============================================================
-- 1 a 6 serviços, sem nulo e sem repetido.
create or replace function public.servicos_lista_valida(p_ids uuid[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    cardinality(p_ids) between 1 and 6
    and not exists (select 1 from unnest(p_ids) x where x is null)
    and (select count(distinct x) from unnest(p_ids) x) = cardinality(p_ids),
    false
  );
$$;

-- Soma das durações efetivas. Null se a lista é inválida ou se a
-- profissional não faz algum dos serviços.
create or replace function public.duracao_total(p_profissional_id uuid, p_servico_ids uuid[])
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when public.servicos_lista_valida(p_servico_ids) and count(*) = cardinality(p_servico_ids)
              then sum(coalesce(ps.duracao_override_min, s.duracao_min))::int end
  from unnest(p_servico_ids) as u(sid)
  join profissional_servicos ps on ps.profissional_id = p_profissional_id and ps.servico_id = u.sid
  join servicos s on s.id = u.sid;
$$;

-- Nomes dos serviços do agendamento na ordem: "Design + Henna". Sem linha em
-- agendamento_servicos, cai no servico_id do agendamento.
create or replace function public.nome_servicos(p_agendamento_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select string_agg(s.nome, ' + ' order by i.ordem)
     from agendamento_servicos i join servicos s on s.id = i.servico_id
     where i.agendamento_id = p_agendamento_id),
    (select s.nome from agendamentos a join servicos s on s.id = a.servico_id where a.id = p_agendamento_id)
  );
$$;

-- A lista de serviços do INSERT que está acontecendo: agendar() deixa os ids
-- numa configuração local da transação (app.servico_ids) porque o
-- agendamento nasce antes dos itens. Só vale se o primeiro id for o
-- servico_id da linha; fora disso (importação, painel, SQL direto) é o
-- serviço único de sempre.
create or replace function public.servicos_em_gravacao(p_servico_id uuid)
returns uuid[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_txt text := nullif(current_setting('app.servico_ids', true), '');
  v_ids uuid[];
begin
  if v_txt is not null then
    begin
      v_ids := string_to_array(v_txt, ',')::uuid[];
    exception when others then
      v_ids := null;
    end;
  end if;
  if v_ids is null or v_ids[1] is distinct from p_servico_id then
    return array[p_servico_id];
  end if;
  return v_ids;
end;
$$;

-- AFTER INSERT: grava os itens (ordem do array; sem lista, um item só).
create or replace function public.agendamentos_grava_servicos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := public.servicos_em_gravacao(new.servico_id);
begin
  perform set_config('app.servico_ids', '', true);

  insert into agendamento_servicos (agendamento_id, servico_id, ordem, duracao_min, preco)
  select new.id, u.sid, u.ord::smallint,
         coalesce(ps.duracao_override_min, s.duracao_min),
         coalesce(ps.preco_override, s.preco)
  from unnest(v_ids) with ordinality as u(sid, ord)
  join servicos s on s.id = u.sid
  left join profissional_servicos ps on ps.profissional_id = new.profissional_id and ps.servico_id = u.sid
  on conflict (agendamento_id, ordem) do nothing;

  return null;
end;
$$;

drop trigger if exists agendamentos_grava_servicos on agendamentos;
create trigger agendamentos_grava_servicos
  after insert on agendamentos
  for each row execute function public.agendamentos_grava_servicos();

-- Staff/owner trocando o servico_id do agendamento: o primeiro item acompanha
-- (os demais ficam). Mantém servico_id = primeiro serviço.
create or replace function public.agendamentos_sincroniza_servico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update agendamento_servicos i
  set servico_id = new.servico_id,
      duracao_min = coalesce(ps.duracao_override_min, s.duracao_min),
      preco = coalesce(ps.preco_override, s.preco)
  from servicos s
  left join profissional_servicos ps on ps.profissional_id = new.profissional_id and ps.servico_id = new.servico_id
  where s.id = new.servico_id and i.agendamento_id = new.id and i.ordem = 1;
  return null;
end;
$$;

drop trigger if exists agendamentos_sincroniza_servico on agendamentos;
create trigger agendamentos_sincroniza_servico
  after update of servico_id on agendamentos
  for each row
  when (old.servico_id is distinct from new.servico_id)
  execute function public.agendamentos_sincroniza_servico();

-- =============================================================
-- 3. Motor de agendamento com vários serviços
-- =============================================================
create or replace function public.horarios_disponiveis(
  p_profissional_id uuid,
  p_servico_ids uuid[],
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
  if not public.servicos_lista_valida(p_servico_ids) then
    return;
  end if;
  if not exists (select 1 from profissionais where id = p_profissional_id and ativo) then
    return;
  end if;
  if exists (
    select 1 from unnest(p_servico_ids) u(sid)
    where not exists (select 1 from servicos s where s.id = u.sid and s.ativo)
  ) then
    return;
  end if;

  v_duracao := public.duracao_total(p_profissional_id, p_servico_ids);
  if v_duracao is null then
    return; -- essa profissional não faz algum desses serviços
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

-- Serviço único: delega à versão nova.
create or replace function public.horarios_disponiveis(
  p_profissional_id uuid,
  p_servico_id uuid,
  p_data date,
  p_ignorar_agendamento_id uuid default null
)
returns setof timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select * from public.horarios_disponiveis(p_profissional_id, array[p_servico_id], p_data, p_ignorar_agendamento_id);
$$;

create or replace function public.dias_disponiveis(
  p_profissional_id uuid,
  p_servico_ids uuid[],
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
    select 1 from public.horarios_disponiveis(p_profissional_id, p_servico_ids, d::date, p_ignorar_agendamento_id)
  );
$$;

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
  select * from public.dias_disponiveis(p_profissional_id, array[p_servico_id], p_de, p_ate, p_ignorar_agendamento_id);
$$;

-- Profissionais ativas que fazem TODOS os serviços, com duração somada e
-- preço somado. Se algum serviço é "consulte o valor" (preço null), o total
-- também é null: não dá pra mostrar uma soma parcial como se fosse o valor.
create or replace function public.profissionais_dos_servicos(p_servico_ids uuid[])
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
         case when count(*) filter (where coalesce(ps.preco_override, s.preco) is null) > 0
              then null else sum(coalesce(ps.preco_override, s.preco)) end,
         sum(coalesce(ps.duracao_override_min, s.duracao_min))::int
  from profissional_servicos ps
  join profissionais p on p.id = ps.profissional_id
  join servicos s on s.id = ps.servico_id
  where public.servicos_lista_valida(p_servico_ids)
    and ps.servico_id = any(p_servico_ids)
    and p.ativo and s.ativo
  group by p.id, p.nome, p.bio, p.foto_url, p.papel
  having count(*) = cardinality(p_servico_ids)
  order by p.papel, p.nome;
$$;

-- Validação de horário no banco: mesma regra de antes, com a duração e o
-- horário calculados sobre a SOMA dos serviços. Na criação, a lista vem de
-- agendar() (servicos_em_gravacao); na remarcação, dos itens já gravados.
create or replace function public.valida_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
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

  if tg_op = 'INSERT' and (
    select count(*) from agendamentos a
    where a.cliente_id = new.cliente_id and a.status = 'confirmado' and lower(a.periodo) > now()
  ) >= public.config_int('max_agendamentos_futuros_cliente', 3) then
    raise exception 'limite_agendamentos';
  end if;

  if tg_op = 'INSERT' then
    v_ids := public.servicos_em_gravacao(new.servico_id);
    v_duracao := public.duracao_total(new.profissional_id, v_ids);
  else
    v_ids := coalesce(
      (select array_agg(i.servico_id order by i.ordem) from agendamento_servicos i where i.agendamento_id = new.id),
      array[new.servico_id]
    );
    v_duracao := coalesce(
      (select sum(i.duracao_min)::int from agendamento_servicos i where i.agendamento_id = new.id),
      public.duracao_total(new.profissional_id, v_ids)
    );
  end if;

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
      v_ids,
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

-- security INVOKER como a versão de serviço único: RLS e triggers valem. O
-- agendamento nasce com servico_id = primeiro serviço; o trigger
-- agendamentos_grava_servicos grava os itens na ordem do array.
create or replace function public.agendar(
  p_profissional_id uuid,
  p_servico_ids uuid[],
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

  if not public.servicos_lista_valida(p_servico_ids) then
    raise exception 'servicos_invalidos';
  end if;

  v_duracao := public.duracao_total(p_profissional_id, p_servico_ids);
  if v_duracao is null then
    raise exception 'servico_nao_oferecido';
  end if;

  perform set_config('app.servico_ids', array_to_string(p_servico_ids, ','), true);

  insert into agendamentos (cliente_id, profissional_id, servico_id, periodo, canal, observacoes)
  values (
    v_cliente,
    p_profissional_id,
    p_servico_ids[1],
    tstzrange(p_inicio, p_inicio + make_interval(mins => v_duracao)),
    case when p_cliente_id is null then 'app' else 'painel' end,
    nullif(trim(p_observacoes), '')
  )
  returning id into v_id;

  perform set_config('app.servico_ids', '', true);

  return v_id;
end;
$$;

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
begin
  return public.agendar(p_profissional_id, array[p_servico_id], p_inicio, p_cliente_id, p_observacoes);
end;
$$;

-- Remarcar: a duração é a soma dos itens do agendamento (sem itens, a do
-- serviço único, como antes).
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

  v_duracao := coalesce(
    (select sum(i.duracao_min)::int from agendamento_servicos i where i.agendamento_id = p_agendamento_id),
    public.duracao_efetiva(v_ag.profissional_id, v_ag.servico_id),
    (select duracao_min from servicos where id = v_ag.servico_id)
  );

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

-- =============================================================
-- 4. Lembretes, protocolo pós, métricas e faturamento
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
    public.nome_servicos(a.id),
    p.nome
  from agendamentos a
  join clientes c on c.id = a.cliente_id
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
  select a.id, c.id, c.nome, c.whatsapp, public.nome_servicos(a.id)
  from agendamentos a
  join clientes c on c.id = a.cliente_id
  join profissionais p on p.id = a.profissional_id and p.papel = 'owner'
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

-- Protocolo pós: um agendamento por linha. Com mais de um serviço com
-- protocolo cadastrado, o texto junta os protocolos na ordem, cada um sob o
-- nome do serviço em negrito do WhatsApp (*Nome*).
create or replace function public.protocolos_pendentes()
returns table (
  agendamento_id uuid,
  cliente_nome text,
  cliente_whatsapp text,
  servico_nome text,
  profissional_nome text,
  protocolo text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, c.nome, c.whatsapp, public.nome_servicos(a.id), p.nome, x.texto
  from agendamentos a
  join clientes c on c.id = a.cliente_id
  join profissionais p on p.id = a.profissional_id
  cross join lateral (
    select string_agg(
             case when n.qtd > 1 then '*' || sv.nome || '*' || E'\n' || n.txt else n.txt end,
             E'\n\n' order by n.ordem
           ) as texto
    from (
      select i.ordem, i.servico_id, trim(ps.protocolo) as txt, count(*) over () as qtd
      from agendamento_servicos i
      join profissional_servicos ps on ps.profissional_id = a.profissional_id and ps.servico_id = i.servico_id
      where i.agendamento_id = a.id and nullif(trim(ps.protocolo), '') is not null
    ) n
    join servicos sv on sv.id = n.servico_id
  ) x
  where a.status in ('confirmado', 'concluido')
    and a.protocolo_enviado_em is null
    and upper(a.periodo) <= now() - interval '10 minutes'
    and upper(a.periodo) > now() - interval '24 hours'
    and x.texto is not null;
$$;

create or replace function public.faturamento_periodo(data_inicio date, data_fim date)
returns table (
  profissional_id uuid,
  profissional_nome text,
  atendimentos bigint,
  sem_preco bigint,
  total numeric
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
    with concluidos as (
      -- um atendimento por linha; o valor é a soma dos preços dos serviços
      -- (preço da época, gravado em agendamento_servicos). Atendimento com
      -- algum serviço sem preço conta em `sem_preco`.
      select a.profissional_id as prof,
             coalesce(sum(i.preco), 0) as soma_itens,
             coalesce(bool_or(i.preco is null), true) as tem_sem_preco
      from agendamentos a
      left join agendamento_servicos i on i.agendamento_id = a.id
      where a.status = 'concluido'
        and (lower(a.periodo) at time zone 'America/Fortaleza')::date between data_inicio and data_fim
      group by a.id
    ),
    por_prof as (
      select p.id, p.nome, p.papel,
             count(c.prof) as n,
             count(c.prof) filter (where c.tem_sem_preco) as n_sem_preco,
             coalesce(sum(c.soma_itens), 0)::numeric as soma
      from profissionais p
      left join concluidos c on c.prof = p.id
      group by p.id
      having p.ativo or count(c.prof) > 0
    )
    select x.id, x.nome, x.n, x.n_sem_preco, x.soma
    from (
      select id, nome, n, n_sem_preco, soma, 0 as ordem, papel from por_prof
      union all
      select null, 'Total', sum(n)::bigint, sum(n_sem_preco)::bigint, coalesce(sum(soma), 0), 1, null from por_prof
    ) x
    order by x.ordem, x.papel, x.nome;
end;
$$;

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
    -- um agendamento por linha; preco = soma dos preços conhecidos dos
    -- serviços, sem_preco = algum serviço sem preço
    select
      a.id,
      a.cliente_id,
      a.status,
      (lower(a.periodo) at time zone 'America/Fortaleza')::date as dia,
      coalesce(sum(i.preco), 0) as preco,
      coalesce(bool_or(i.preco is null), true) as sem_preco,
      p.nome as profissional_nome
    from agendamentos a
    join profissionais p on p.id = a.profissional_id
    left join agendamento_servicos i on i.agendamento_id = a.id
    where (lower(a.periodo) at time zone 'America/Fortaleza')::date between p_inicio and p_fim
    group by a.id, p.nome
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
  ),
  servicos_validos as (
    -- cada serviço de cada agendamento válido (um atendimento com 2
    -- serviços conta uma vez em cada um)
    select s.nome as servico_nome
    from validos v
    join agendamento_servicos i on i.agendamento_id = v.id
    join servicos s on s.id = i.servico_id
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
      select coalesce(jsonb_agg(jsonb_build_object('nome', servico_nome, 'total', n) order by n desc, servico_nome), '[]'::jsonb)
      from (select servico_nome, count(*) as n from servicos_validos group by servico_nome order by n desc, servico_nome limit 5) x
    ),
    'profissionais_mais_agendadas', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', profissional_nome, 'total', n) order by n desc), '[]'::jsonb)
      from (select profissional_nome, count(*) as n from validos group by profissional_nome order by n desc limit 5) x
    ),
    'receita_estimada', (
      select coalesce(sum(preco), 0) from base where status = 'concluido'
    ),
    'concluidos_sem_preco', (
      select count(*) from base where status = 'concluido' and sem_preco
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
-- 5. Nome da cliente
-- =============================================================
-- Igual à versão anterior, mais: se a cliente já existe e o nome atual é o
-- placeholder ("Cliente" do login por código, ou sem nenhuma letra, como o
-- telefone vindo da planilha), troca pelo nome informado. Nome de verdade
-- nunca é sobrescrito.
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

  if trim(p_nome) ~ '[[:alpha:]]' then
    update clientes set nome = trim(p_nome)
    where whatsapp = p_whatsapp
      and (lower(trim(nome)) = 'cliente' or nome !~ '[[:alpha:]]')
      and nome is distinct from trim(p_nome);
  end if;

  select id into v_id from clientes where whatsapp = p_whatsapp;
  return v_id;
end;
$$;

-- Caminho oficial para corrigir o nome de uma cliente pelo painel: owner, ou
-- profissional com pelo menos um atendimento CONCLUÍDO com ela (ter só
-- agendamento marcado não basta: staff pode marcar para qualquer cliente_id).
create or replace function public.renomear_cliente(p_cliente_id uuid, p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := trim(coalesce(p_nome, ''));
begin
  if public.meu_profissional_id() is null then
    raise exception 'apenas_profissionais';
  end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'cliente_nao_encontrada';
  end if;
  if not (
    public.eh_owner()
    or exists (
      select 1 from agendamentos a
      where a.cliente_id = p_cliente_id
        and a.profissional_id = public.meu_profissional_id()
        and a.status = 'concluido'
    )
  ) then
    raise exception 'sem_permissao';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;

  update clientes set nome = v_nome where id = p_cliente_id;
end;
$$;

-- =============================================================
-- 6. Permissões
-- =============================================================
revoke all on function public.servicos_lista_valida(uuid[]) from public, anon, authenticated;
revoke all on function public.duracao_total(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.nome_servicos(uuid) from public, anon, authenticated;
revoke all on function public.servicos_em_gravacao(uuid) from public, anon, authenticated;
revoke all on function public.agendamentos_grava_servicos() from public, anon, authenticated;
revoke all on function public.agendamentos_sincroniza_servico() from public, anon, authenticated;
revoke all on function public.horarios_disponiveis(uuid, uuid[], date, uuid) from public, anon, authenticated;
revoke all on function public.horarios_disponiveis(uuid, uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.dias_disponiveis(uuid, uuid[], date, date, uuid) from public, anon, authenticated;
revoke all on function public.dias_disponiveis(uuid, uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public.profissionais_dos_servicos(uuid[]) from public, anon, authenticated;
revoke all on function public.agendar(uuid, uuid[], timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.agendar(uuid, uuid, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.renomear_cliente(uuid, text) from public, anon, authenticated;

grant execute on function public.horarios_disponiveis(uuid, uuid[], date, uuid) to anon, authenticated;
grant execute on function public.horarios_disponiveis(uuid, uuid, date, uuid) to anon, authenticated;
grant execute on function public.dias_disponiveis(uuid, uuid[], date, date, uuid) to anon, authenticated;
grant execute on function public.dias_disponiveis(uuid, uuid, date, date, uuid) to anon, authenticated;
grant execute on function public.profissionais_dos_servicos(uuid[]) to anon, authenticated;

grant execute on function public.agendar(uuid, uuid[], timestamptz, uuid, text) to authenticated;
grant execute on function public.agendar(uuid, uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.renomear_cliente(uuid, text) to authenticated;

-- agendar() é security invoker e chama estas por dentro com o papel de quem
-- está logado (como duracao_efetiva e config_int na migration do motor).
grant execute on function public.servicos_lista_valida(uuid[]) to authenticated;
grant execute on function public.duracao_total(uuid, uuid[]) to authenticated;

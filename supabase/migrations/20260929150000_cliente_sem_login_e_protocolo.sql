-- Cliente sem login (sessão anônima do Supabase) + protocolo pós-atendimento.
--
-- 1. A cliente não entra mais com código de WhatsApp. O app cria uma sessão
--    anônima (supabase.auth.signInAnonymously) e a cliente se cadastra por
--    cadastrar_cliente(), que liga a linha de `clientes` ao auth.uid() dessa
--    sessão. meu_cliente_id() e todas as policies de cliente continuam as
--    mesmas: só muda como o user_id é preenchido. Gisele e profissionais
--    continuam entrando por telefone + código (handle_new_user intacto;
--    usuário anônimo não tem telefone e passa direto por ele).
-- 2. Foto opcional da cliente, no mesmo bucket e com a mesma validação de
--    magic bytes (validar-foto) das fotos de profissional.
-- 3. Limite de agendamentos futuros por cliente: com sessão anônima,
--    qualquer pessoa vira "cliente" sem provar nada, então a agenda precisa
--    de um teto contra quem tenta lotar os horários.
-- 4. Protocolo pós-atendimento por profissional + serviço, enviado por
--    WhatsApp 10 minutos depois do fim do atendimento (Edge Function
--    enviar-protocolos, a cada 5 minutos pelo pg_cron).
--
-- Idempotente: pode rodar de novo sem erro.

-- =============================================================
-- 1. Colunas novas
-- =============================================================
alter table clientes add column if not exists foto_url text;
alter table agendamentos add column if not exists protocolo_enviado_em timestamptz;
alter table profissional_servicos add column if not exists protocolo text;

insert into configuracoes (chave, valor) values
  ('max_agendamentos_futuros_cliente', '3')
on conflict (chave) do nothing;

-- Cada vez que um número passa de uma sessão pra outra (aparelho novo,
-- navegador limpo, app instalado no iPhone — que não compartilha dados com
-- o Safari). Serve de auditoria pra Gisele e de freio contra quem fica
-- trocando o vínculo de um número que não é dele.
create table if not exists clientes_trocas_aparelho (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  user_id_anterior uuid,
  user_id_novo uuid not null,
  em timestamptz not null default now()
);
create index if not exists clientes_trocas_aparelho_cliente_idx on clientes_trocas_aparelho (cliente_id, em);

alter table clientes_trocas_aparelho enable row level security;
drop policy if exists "owner_le_trocas_aparelho" on clientes_trocas_aparelho;
create policy "owner_le_trocas_aparelho" on clientes_trocas_aparelho
  for select using (public.eh_owner());

-- =============================================================
-- 2. Cadastro da cliente (sem código)
-- =============================================================
-- O número digitado é a identidade, sem verificação (decisão de produto de
-- 29/09/2026: zero fricção pra cliente). Regras:
--   - número novo: cria a cliente ligada a esta sessão;
--   - número que já existe (planilha, pré-cadastro, painel, ou outra
--     sessão da mesma cliente): a linha passa pra esta sessão, e a sessão
--     anterior perde o acesso. Dados que já estavam lá (nome, nascimento)
--     não são sobrescritos por quem chega;
--   - no máximo 3 trocas de sessão por número a cada 24h;
--   - uma sessão = uma cliente: não dá pra "trocar de número" por aqui.
-- Ver PENDENCIAS.md (riscos da sessão anônima) antes de mudar.
create or replace function public.cadastrar_cliente(
  p_nome text,
  p_whatsapp text,
  p_data_nascimento date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text := trim(coalesce(p_nome, ''));
  v_proprio record;
  v_existente record;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sessao_ausente';
  end if;
  -- celular/fixo brasileiro: DDD sem zero + 8 ou 9 dígitos
  if p_whatsapp is null or p_whatsapp !~ '^\+55[1-9][1-9][0-9]{8,9}$' then
    raise exception 'whatsapp_invalido';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 100 then
    raise exception 'nome_invalido';
  end if;
  if p_data_nascimento is not null
    and (p_data_nascimento < date '1900-01-01' or p_data_nascimento > (now() at time zone 'America/Fortaleza')::date)
  then
    raise exception 'nascimento_invalido';
  end if;

  -- esta sessão já tem cadastro (ex: toque duplo no botão)
  select id, whatsapp into v_proprio from clientes where user_id = v_uid;
  if found then
    if v_proprio.whatsapp <> p_whatsapp then
      raise exception 'cliente_ja_cadastrada';
    end if;
    return v_proprio.id;
  end if;

  select id, user_id, nome into v_existente from clientes where whatsapp = p_whatsapp for update;

  if not found then
    insert into clientes (user_id, nome, whatsapp, data_nascimento)
    values (v_uid, v_nome, p_whatsapp, p_data_nascimento)
    returning id into v_id;
    return v_id;
  end if;

  if (select count(*) from clientes_trocas_aparelho t
      where t.cliente_id = v_existente.id and t.em > now() - interval '24 hours') >= 3 then
    raise exception 'muitas_trocas_de_aparelho';
  end if;

  -- libera o trigger protege_campos_cliente só pra este update
  perform set_config('app.vinculo_cadastro', 'on', true);
  update clientes set
    user_id = v_uid,
    -- nome da planilha que era só o telefone, ou o "Cliente" do login antigo
    nome = case when nome = 'Cliente' or nome !~ '[[:alpha:]]' then v_nome else nome end,
    data_nascimento = coalesce(data_nascimento, p_data_nascimento)
  where id = v_existente.id;
  perform set_config('app.vinculo_cadastro', '', true);

  insert into clientes_trocas_aparelho (cliente_id, user_id_anterior, user_id_novo)
  values (v_existente.id, v_existente.user_id, v_uid);

  return v_existente.id;
end;
$$;

-- whatsapp/user_id continuam fora do alcance da cliente num UPDATE direto;
-- só cadastrar_cliente() muda o vínculo. A foto da cliente só pode apontar
-- pra pasta dela no bucket (sem isso, dava pra pôr uma URL externa que
-- carregaria no celular das profissionais ao abrir a agenda).
create or replace function public.protege_campos_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.eh_owner()
    and coalesce(current_setting('app.vinculo_cadastro', true), '') <> 'on'
  then
    if new.whatsapp is distinct from old.whatsapp or new.user_id is distinct from old.user_id then
      raise exception 'whatsapp e vínculo de login só podem ser alterados pelo studio';
    end if;
  end if;

  if auth.uid() is not null and not public.eh_owner()
    and new.foto_url is not null
    and new.foto_url is distinct from (case when tg_op = 'UPDATE' then old.foto_url end)
    and new.foto_url not like 'https://pjbcgyzykvidbwdjlnvp.supabase.co/storage/v1/object/public/fotos/clientes/' || new.id || '/%'
  then
    raise exception 'foto_invalida';
  end if;

  if new.consentimento and (tg_op = 'INSERT' or not old.consentimento) then
    new.consentimento_em := now();
  end if;

  return new;
end;
$$;

-- =============================================================
-- 3. Foto da cliente no Storage
-- =============================================================
-- Caminho: clientes/{cliente_id}/arquivo.webp. Até 3 arquivos na pasta (o
-- app apaga a foto anterior ao trocar), pra ninguém usar o bucket público
-- como depósito com uma sessão anônima. validar-foto confere os magic bytes
-- de qualquer arquivo novo no bucket, inclusive estes.
create or replace function public.pode_enviar_foto_cliente(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.meu_cliente_id() is not null
    and (storage.foldername(p_nome))[1] = 'clientes'
    and (storage.foldername(p_nome))[2] = public.meu_cliente_id()::text
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'fotos' and o.name like 'clientes/' || public.meu_cliente_id()::text || '/%'
    ) < 3;
$$;

drop policy if exists "cliente_upload_propria_foto" on storage.objects;
create policy "cliente_upload_propria_foto" on storage.objects
  for insert with check (bucket_id = 'fotos' and public.pode_enviar_foto_cliente(name));

drop policy if exists "cliente_apaga_propria_foto" on storage.objects;
create policy "cliente_apaga_propria_foto" on storage.objects
  for delete using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = 'clientes'
    and (storage.foldername(name))[2] = public.meu_cliente_id()::text
  );

-- =============================================================
-- 4. Teto de agendamentos futuros por cliente
-- =============================================================
-- Mesma função da migration 20260925170000, com o teto no caminho da
-- cliente (staff/owner continuam passando direto).
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

  if tg_op = 'INSERT' and (
    select count(*) from agendamentos a
    where a.cliente_id = new.cliente_id and a.status = 'confirmado' and lower(a.periodo) > now()
  ) >= public.config_int('max_agendamentos_futuros_cliente', 3) then
    raise exception 'limite_agendamentos';
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

-- =============================================================
-- 5. Protocolo pós-atendimento
-- =============================================================
-- O texto não é público: a leitura aberta de profissional_servicos (tela de
-- escolher profissional) continua, mas sem a coluna protocolo. A
-- profissional lê e grava o próprio protocolo pelas RPCs abaixo, que só
-- enxergam as linhas dela (profissional_id = meu_profissional_id()), ou
-- seja, só os serviços que ela atende.
revoke select on profissional_servicos from anon, authenticated;
grant select (profissional_id, servico_id, preco_override, duracao_override_min) on profissional_servicos to anon, authenticated;

create or replace function public.meus_protocolos()
returns table (servico_id uuid, servico_nome text, protocolo text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.meu_profissional_id() is null then
    raise exception 'apenas_profissionais';
  end if;
  return query
    select s.id, s.nome, ps.protocolo
    from profissional_servicos ps
    join servicos s on s.id = ps.servico_id
    where ps.profissional_id = public.meu_profissional_id()
    order by s.nome;
end;
$$;

create or replace function public.salvar_protocolo(p_servico_id uuid, p_protocolo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.meu_profissional_id() is null then
    raise exception 'apenas_profissionais';
  end if;
  if length(coalesce(p_protocolo, '')) > 2000 then
    raise exception 'protocolo_longo';
  end if;

  update profissional_servicos
  set protocolo = nullif(trim(p_protocolo), '')
  where profissional_id = public.meu_profissional_id() and servico_id = p_servico_id;

  if not found then
    raise exception 'servico_nao_atendido';
  end if;
end;
$$;

-- Ninguém do app (cliente, staff, owner) mexe em protocolo_enviado_em: só a
-- Edge Function, com a service role. Sem isso, zerar a coluna reenviaria o
-- protocolo.
create or replace function public.protege_protocolo_enviado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.protocolo_enviado_em is distinct from old.protocolo_enviado_em then
    raise exception 'protocolo_enviado_em é controlado pelo sistema';
  end if;
  return new;
end;
$$;

drop trigger if exists agendamentos_protege_protocolo on agendamentos;
create trigger agendamentos_protege_protocolo
  before update on agendamentos
  for each row execute function public.protege_protocolo_enviado();

-- Atendimentos que terminaram há pelo menos 10 minutos (e há no máximo 24h,
-- pra não disparar protocolo de atendimento antigo no dia em que isto for
-- ao ar), não cancelados nem faltas, com protocolo cadastrado pra essa
-- profissional + serviço e ainda não enviado. Inclui 'concluido': a
-- profissional costuma dar baixa logo depois de atender, e isso não pode
-- impedir o protocolo de sair.
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
  select a.id, c.nome, c.whatsapp, s.nome, p.nome, trim(ps.protocolo)
  from agendamentos a
  join clientes c on c.id = a.cliente_id
  join servicos s on s.id = a.servico_id
  join profissionais p on p.id = a.profissional_id
  join profissional_servicos ps on ps.profissional_id = a.profissional_id and ps.servico_id = a.servico_id
  where a.status in ('confirmado', 'concluido')
    and a.protocolo_enviado_em is null
    and upper(a.periodo) <= now() - interval '10 minutes'
    and upper(a.periodo) > now() - interval '24 hours'
    and nullif(trim(ps.protocolo), '') is not null;
$$;

-- Marca ANTES de enviar (mesmo tradeoff de registraEEnvia nos lembretes):
-- dois runs do cron ao mesmo tempo, só um recebe true. Falha de envio depois
-- disso não reenvia sozinha, mas nunca manda duplicado.
create or replace function public.reivindicar_protocolo(p_agendamento_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update agendamentos set protocolo_enviado_em = now()
  where id = p_agendamento_id and protocolo_enviado_em is null;
  return found;
end;
$$;

-- =============================================================
-- 6. Permissões das funções
-- =============================================================
revoke all on function public.cadastrar_cliente(text, text, date) from public, anon, authenticated;
revoke all on function public.pode_enviar_foto_cliente(text) from public, anon, authenticated;
revoke all on function public.meus_protocolos() from public, anon, authenticated;
revoke all on function public.salvar_protocolo(uuid, text) from public, anon, authenticated;
revoke all on function public.protocolos_pendentes() from public, anon, authenticated;
revoke all on function public.reivindicar_protocolo(uuid) from public, anon, authenticated;

-- sessão anônima também é `authenticated` no Postgres
grant execute on function public.cadastrar_cliente(text, text, date) to authenticated;
-- chamada pela policy de storage; anon precisa de EXECUTE pra policy
-- avaliar (e dar false) em vez de estourar "permission denied"
grant execute on function public.pode_enviar_foto_cliente(text) to anon, authenticated;
grant execute on function public.meus_protocolos() to authenticated;
grant execute on function public.salvar_protocolo(uuid, text) to authenticated;
grant execute on function public.protocolos_pendentes() to service_role;
grant execute on function public.reivindicar_protocolo(uuid) to service_role;

-- =============================================================
-- 7. pg_cron — protocolo a cada 5 minutos
-- =============================================================
-- Mesmo CRON_SECRET das outras functions agendadas (migration
-- 20260925160000); o gerador de supabase/colar/ já preenche.
select cron.schedule(
  'enviar-protocolos-5min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/enviar-protocolos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<COLE_O_CRON_SECRET_AQUI>'),
    body := '{}'::jsonb
  );
  $cron$
);

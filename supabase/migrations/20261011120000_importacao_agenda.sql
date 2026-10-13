-- Fase 26: importar a agenda do Google Calendar e as clientes da planilha
-- CRM (scripts/importar-agenda.mjs) antes de desligar o n8n.
--
-- 1. origem_externa_id: o UID do evento do Calendar que virou o
--    agendamento (ou o bloqueio). É o que deixa rodar a importação de novo
--    sem duplicar (on conflict do nothing).
-- 2. Telefone com e sem o 9: a planilha e o WhatsApp às vezes trazem o
--    celular sem o 9 (55 99 8418-3784). variantes_telefone() é a mesma regra
--    de variantesTelefone() da resposta automática
--    (supabase/functions/responder-whatsapp/regras.ts).
-- 3. cadastrar_cliente() acha a ficha pelo número com ou sem o 9, e o
--    primeiro cadastro numa ficha que nunca teve sessão (veio da planilha,
--    da agenda antiga, do pré-cadastro ou do painel) não conta como troca de
--    aparelho: não havia aparelho antes.
--
-- Idempotente: pode rodar de novo sem erro.

-- =============================================================
-- 1. Origem externa
-- =============================================================
alter table agendamentos add column if not exists origem_externa_id text;
create unique index if not exists agendamentos_origem_externa_id_key on agendamentos (origem_externa_id);

-- O mesmo evento de dia inteiro pode virar bloqueio de mais de uma
-- profissional (studio fechado), então a chave inclui a profissional.
alter table bloqueios_agenda add column if not exists origem_externa_id text;
create unique index if not exists bloqueios_agenda_origem_externa_id_key on bloqueios_agenda (profissional_id, origem_externa_id);

-- =============================================================
-- 2. Telefone com e sem o 9
-- =============================================================
create or replace function public.variantes_telefone(p_e164 text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
    when p_e164 ~ '^\+55[0-9]{2}[0-9]{8}$' then array[p_e164, '+55' || substr(p_e164, 4, 2) || '9' || substr(p_e164, 6)]
    when p_e164 ~ '^\+55[0-9]{2}9[0-9]{8}$' then array[p_e164, '+55' || substr(p_e164, 4, 2) || substr(p_e164, 7)]
    else array[p_e164]
  end;
$$;

-- =============================================================
-- 3. Cadastro da cliente
-- =============================================================
-- Auditoria do primeiro vínculo: quando uma ficha que nunca teve sessão
-- (planilha, agenda antiga, pré-cadastro, painel) é assumida por um
-- aparelho. Não é troca de aparelho (não havia aparelho antes), mas o
-- número continua sem verificação, então a Gisele precisa conseguir ver
-- quem assumiu a ficha e quando — como já via em clientes_trocas_aparelho.
create table if not exists clientes_primeiro_vinculo (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  user_id uuid not null,
  em timestamptz not null default now()
);
create index if not exists clientes_primeiro_vinculo_cliente_idx on clientes_primeiro_vinculo (cliente_id, em);

alter table clientes_primeiro_vinculo enable row level security;
drop policy if exists "owner_le_primeiro_vinculo" on clientes_primeiro_vinculo;
create policy "owner_le_primeiro_vinculo" on clientes_primeiro_vinculo
  for select using (public.eh_owner());

-- Mesma função da migration 20260929150000, com duas mudanças:
--   - a ficha que já existe é procurada pelo número com e sem o 9 (o
--     whatsapp gravado na ficha não muda: é o que já recebia mensagem);
--   - só vira linha em clientes_trocas_aparelho quando a ficha já estava
--     ligada a outra sessão. Também só essas contam no limite de 3 por dia
--     (uma ficha sem sessão só pode ser assumida uma vez: dali em diante é
--     troca). O primeiro vínculo fica em clientes_primeiro_vinculo.
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
  v_variantes text[];
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

  v_variantes := public.variantes_telefone(p_whatsapp);

  -- esta sessão já tem cadastro (ex: toque duplo no botão)
  select id, whatsapp into v_proprio from clientes where user_id = v_uid;
  if found then
    if not (v_proprio.whatsapp = any(v_variantes)) then
      raise exception 'cliente_ja_cadastrada';
    end if;
    return v_proprio.id;
  end if;

  -- se existirem as duas formas (ficha duplicada de antes), vale a digitada
  select id, user_id, nome into v_existente
  from clientes
  where whatsapp = any(v_variantes)
  order by (whatsapp = p_whatsapp) desc, criado_em
  limit 1
  for update;

  if not found then
    insert into clientes (user_id, nome, whatsapp, data_nascimento)
    values (v_uid, v_nome, p_whatsapp, p_data_nascimento)
    returning id into v_id;
    return v_id;
  end if;

  if v_existente.user_id is not null and (
    select count(*) from clientes_trocas_aparelho t
    where t.cliente_id = v_existente.id and t.em > now() - interval '24 hours'
  ) >= 3 then
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

  if v_existente.user_id is not null then
    insert into clientes_trocas_aparelho (cliente_id, user_id_anterior, user_id_novo)
    values (v_existente.id, v_existente.user_id, v_uid);
  else
    insert into clientes_primeiro_vinculo (cliente_id, user_id)
    values (v_existente.id, v_uid);
  end if;

  return v_existente.id;
end;
$$;

-- =============================================================
-- 4. Permissões
-- =============================================================
revoke all on function public.variantes_telefone(text) from public, anon, authenticated;
revoke all on function public.cadastrar_cliente(text, text, date) from public, anon, authenticated;
grant execute on function public.cadastrar_cliente(text, text, date) to authenticated;

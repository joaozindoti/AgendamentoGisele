-- Studio Gisele Lima 2.0 — schema inicial + RLS completa + storage
-- Referência: studio-gisele-2.0-arquitetura.md, seções 3, 4 e 12.
-- Fase 1 de 10 (seção 14).
--
-- Idempotente: pode rodar de novo inteiro, inclusive depois de uma execução
-- que parou no meio (tabela/índice "if not exists", function "or replace",
-- trigger e policy com "drop ... if exists" antes de criar). O mesmo vale
-- pras outras duas migrations e pro seed.

-- =============================================================
-- 1. Extensões
-- =============================================================
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist; -- exclusion constraint da seção 3.1
-- pg_net: os triggers que chamam Edge Functions (seção 7 abaixo e
-- notificar-agendamento na migration 20260925160000) fazem o POST direto por
-- ela. Forma documentada pelo Supabase pra habilitar por SQL; se der erro de
-- permissão, ligar pg_net em Database → Extensions e rodar de novo.
create extension if not exists pg_net with schema extensions;

-- =============================================================
-- 2. Tipos
-- =============================================================
do $$ begin
  create type papel as enum ('owner', 'staff');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type status_agendamento as enum ('confirmado', 'cancelado', 'concluido', 'no_show');
exception when duplicate_object then null;
end $$;

-- =============================================================
-- 3. Tabelas (seção 3 do documento)
-- =============================================================

-- profissionais (a própria Gisele é uma linha aqui, com papel = owner)
--
-- NOTA: o documento original não previa coluna de telefone em
-- profissionais. Ela é adicionada aqui porque o trigger de vínculo
-- auth.users -> profissionais (seção 4, ponto 5) precisa de algo pra
-- casar o telefone que chega no login OTP com a linha certa. Sem essa
-- coluna, staff/owner nunca conseguem logar pela primeira vez.
create table if not exists profissionais (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) unique,
  nome text not null,
  telefone text unique check (telefone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164 — usado só para vincular o login
  bio text,
  foto_url text,
  papel papel not null default 'staff',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- disponibilidade recorrente (dia da semana + janela de horário)
create table if not exists disponibilidade_profissional (
  id uuid primary key default uuid_generate_v4(),
  profissional_id uuid not null references profissionais(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  check (hora_fim > hora_inicio)
);

-- bloqueios pontuais: férias, folga, ajuste de um dia específico
create table if not exists bloqueios_agenda (
  id uuid primary key default uuid_generate_v4(),
  profissional_id uuid not null references profissionais(id) on delete cascade,
  periodo tstzrange not null,
  motivo text
);

-- serviços do studio
create table if not exists servicos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  descricao text,
  foto_url text,
  preco numeric(10,2), -- null = "consulte o valor"
  duracao_min int not null check (duracao_min > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- quais profissionais fazem quais serviços, com override opcional de preço/duração
create table if not exists profissional_servicos (
  profissional_id uuid not null references profissionais(id) on delete cascade,
  servico_id uuid not null references servicos(id) on delete cascade,
  preco_override numeric(10,2),
  duracao_override_min int check (duracao_override_min > 0),
  primary key (profissional_id, servico_id)
);

-- clientes
create table if not exists clientes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) unique,
  nome text not null,
  -- E.164, ex: +5599988887777. A check constraint é a garantia da seção 11
  -- de que o formato inconsistente de telefone da planilha não volta.
  whatsapp text not null unique check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  endereco text,
  data_nascimento date,
  consentimento boolean not null default false,
  consentimento_em timestamptz, -- momento em que consentimento virou true, pra auditoria LGPD
  consentimento_versao text, -- versão do texto de consentimento aceito, ex: "v1-25092026"
  criado_em timestamptz not null default now()
);

-- o núcleo do sistema
create table if not exists agendamentos (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid not null references clientes(id),
  profissional_id uuid not null references profissionais(id),
  servico_id uuid not null references servicos(id),
  periodo tstzrange not null, -- [inicio, fim)
  status status_agendamento not null default 'confirmado',
  canal text not null default 'app' check (canal in ('app', 'painel')),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- 3.1: garantia física, no banco, de que dois agendamentos confirmados
  -- do mesmo profissional nunca se sobrepõem no tempo.
  exclude using gist (profissional_id with =, periodo with &&) where (status = 'confirmado')
);

create index if not exists agendamentos_cliente_idx on agendamentos (cliente_id);
create index if not exists agendamentos_periodo_idx on agendamentos using gist (periodo);

-- log de lembretes já disparados, pra nunca duplicar
create table if not exists lembretes_enviados (
  id uuid primary key default uuid_generate_v4(),
  agendamento_id uuid references agendamentos(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null, -- '24h' | '1h' | 'confirmacao' | 'cancelamento' | 'aniversario' | '28dias'
  enviado_em timestamptz not null default now(),
  unique (agendamento_id, tipo)
);

-- configurações ajustáveis pela própria Gisele, sem precisar de deploy
create table if not exists configuracoes (
  chave text primary key,
  valor jsonb not null
);

insert into configuracoes (chave, valor) values
  ('horas_minimas_remarcacao', '2')
on conflict (chave) do nothing;

-- rate limit do pré-cadastro público (usada só pela Edge Function
-- `pre-cadastro`, via service role; nunca lida/escrita por anon/authenticated
-- diretamente — ver RLS mais abaixo).
create table if not exists pre_cadastro_tentativas (
  id uuid primary key default uuid_generate_v4(),
  ip text not null,
  telefone text,
  criado_em timestamptz not null default now()
);

create index if not exists pre_cadastro_tentativas_ip_idx on pre_cadastro_tentativas (ip, criado_em);
create index if not exists pre_cadastro_tentativas_telefone_idx on pre_cadastro_tentativas (telefone, criado_em);

-- trigger simples de atualizado_em em agendamentos
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists agendamentos_atualizado_em on agendamentos;
create trigger agendamentos_atualizado_em
  before update on agendamentos
  for each row execute function public.set_atualizado_em();

-- =============================================================
-- 4. Vínculo automático auth.users -> profissionais/clientes (seção 4, ponto 5)
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  -- Login é só por telefone; sem telefone (ex: usuário criado à mão no
  -- dashboard por e-mail) não há o que vincular.
  if new.phone is null or new.phone = '' then
    return new;
  end if;

  -- auth.users.phone é gravado pelo Supabase Auth só com dígitos (sem "+");
  -- o ltrim cobre o caso de algum dia vir com "+" e evita "++".
  v_phone := '+' || ltrim(new.phone, '+');

  -- O telefone é a identidade: quem entra com ele fica com o registro, mesmo
  -- que o registro já estivesse ligado a outro login. Isso cobre a troca de
  -- número feita pelo studio no painel (o login antigo tinha outro telefone)
  -- — sem isso o insert de fallback abaixo batia na unique de whatsapp e o
  -- login com o número novo falhava. Um login só é criado aqui quando nenhum
  -- outro auth.users tem esse telefone, e só vira sessão depois do código
  -- chegar nesse WhatsApp.

  -- 1) vincula a um profissional cadastrado (owner ou staff) pelo telefone
  update profissionais set user_id = new.id
  where telefone = v_phone;

  if found then
    return new;
  end if;

  -- 2) vincula a um cliente que já existia (ex: veio do pré-cadastro)
  update clientes set user_id = new.id
  where whatsapp = v_phone;

  if not found then
    insert into clientes (user_id, nome, whatsapp)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', 'Cliente'), v_phone);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Caminho inverso: a Gisele cadastra uma profissional (ou a si mesma) no
-- painel DEPOIS que essa pessoa já tinha feito login como cliente. Sem isto,
-- o handle_new_user acima nunca roda de novo pra ela e o vínculo não
-- acontece nunca.
create or replace function public.vincula_profissional_a_usuario_existente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null and new.telefone is not null then
    select u.id into new.user_id
    from auth.users u
    where u.phone = ltrim(new.telefone, '+')
      and not exists (select 1 from profissionais p where p.user_id = u.id and p.id <> new.id)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists profissionais_vincula_usuario on profissionais;
create trigger profissionais_vincula_usuario
  before insert or update of telefone on profissionais
  for each row execute function public.vincula_profissional_a_usuario_existente();

-- =============================================================
-- 5. RLS — seção 4 (padrão cliente / staff / owner)
-- =============================================================
--
-- Toda checagem de papel passa por estas funções security definer, em vez
-- de subquery direta em profissionais/clientes dentro da policy. Motivo: uma
-- policy em `profissionais` que consulta `profissionais` (ou `clientes`
-- consultando `agendamentos`, cujas policies consultam `clientes`) faz o
-- Postgres reaplicar RLS dentro da subquery e abortar com "infinite recursion
-- detected in policy". Como security definer, estas funções leem as tabelas
-- sem passar por RLS, e cada policy vira uma chamada simples.

create or replace function public.meu_profissional_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profissionais where user_id = auth.uid() and ativo;
$$;

create or replace function public.eh_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profissionais where user_id = auth.uid() and papel = 'owner' and ativo
  );
$$;

create or replace function public.meu_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from clientes where user_id = auth.uid();
$$;

create or replace function public.staff_atende_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from agendamentos
    where cliente_id = p_cliente_id
      and profissional_id = public.meu_profissional_id()
  );
$$;

create or replace function public.horas_minimas_remarcacao()
returns interval
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (valor #>> '{}')::int from configuracoes where chave = 'horas_minimas_remarcacao'),
    2
  ) * interval '1 hour';
$$;

alter table profissionais enable row level security;
alter table disponibilidade_profissional enable row level security;
alter table bloqueios_agenda enable row level security;
alter table servicos enable row level security;
alter table profissional_servicos enable row level security;
alter table clientes enable row level security;
alter table agendamentos enable row level security;
alter table lembretes_enviados enable row level security;
alter table configuracoes enable row level security;
alter table pre_cadastro_tentativas enable row level security;
-- sem nenhuma policy: anon e authenticated não leem nem escrevem aqui, só a
-- Edge Function via service role (que ignora RLS por padrão no Supabase).

-- ---- configuracoes ----
-- a policy de agendamentos (seção 4) usa a janela mínima de remarcação,
-- e o app mostra essa regra pra cliente, então a leitura é pública.
drop policy if exists "leitura_publica_configuracoes" on configuracoes;
create policy "leitura_publica_configuracoes" on configuracoes
  for select using (true);

drop policy if exists "owner_gerencia_configuracoes" on configuracoes;
create policy "owner_gerencia_configuracoes" on configuracoes
  for all using (public.eh_owner()) with check (public.eh_owner());

-- ---- profissionais ----
-- perfil público (nome/bio/foto) de quem está ativo, pra marketing e pra tela de
-- escolha de profissional funcionar sem exigir login.
drop policy if exists "leitura_publica_profissionais_ativos" on profissionais;
create policy "leitura_publica_profissionais_ativos" on profissionais
  for select using (ativo = true);

drop policy if exists "staff_ve_proprio_registro" on profissionais;
create policy "staff_ve_proprio_registro" on profissionais
  for select using (user_id = auth.uid());

drop policy if exists "staff_atualiza_proprio_perfil" on profissionais;
create policy "staff_atualiza_proprio_perfil" on profissionais
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "owner_gerencia_profissionais" on profissionais;
create policy "owner_gerencia_profissionais" on profissionais
  for all using (public.eh_owner()) with check (public.eh_owner());

-- RLS filtra linha, não coluna: a policy pública acima deixaria qualquer
-- anônimo ler o telefone pessoal de toda profissional ativa. Aqui a coluna
-- `telefone` sai do SELECT de anon/authenticated; o owner lê o telefone pela
-- RPC `profissionais_admin()` (migration 20260925170000). UPDATE/INSERT da
-- coluna continuam liberados — quem pode escrever continua sendo decidido
-- pelas policies e pelo trigger abaixo.
revoke select on profissionais from anon, authenticated;
grant select (id, nome, bio, foto_url, papel, ativo, criado_em) on profissionais to anon;
grant select (id, user_id, nome, bio, foto_url, papel, ativo, criado_em) on profissionais to authenticated;

-- staff e owner compartilham o mesmo role do Postgres (authenticated); a
-- distinção é só por linha via auth.uid(), então GRANT/REVOKE por coluna não
-- separa os dois. Um staff só pode mexer no próprio nome/bio/foto — quem
-- muda papel, ativo, user_id ou telefone tem que ser owner. Isso fecha a
-- escalação de privilégio que "staff_atualiza_proprio_perfil" deixava aberta
-- (a policy só checava dono da linha, não quais colunas mudaram).
create or replace function public.protege_campos_privilegiados_profissionais()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() nulo = service role / SQL Editor / migration, não um usuário do app.
  if auth.uid() is null or public.eh_owner() then
    return new;
  end if;

  if new.papel is distinct from old.papel
    or new.ativo is distinct from old.ativo
    or new.user_id is distinct from old.user_id
    or new.telefone is distinct from old.telefone
  then
    raise exception 'apenas o owner pode alterar papel, ativo, user_id ou telefone de um profissional';
  end if;

  return new;
end;
$$;

drop trigger if exists profissionais_protege_campos_privilegiados on profissionais;
create trigger profissionais_protege_campos_privilegiados
  before update on profissionais
  for each row execute function public.protege_campos_privilegiados_profissionais();

-- ---- disponibilidade_profissional ----
drop policy if exists "leitura_publica_disponibilidade" on disponibilidade_profissional;
create policy "leitura_publica_disponibilidade" on disponibilidade_profissional
  for select using (true);

drop policy if exists "staff_gerencia_propria_disponibilidade" on disponibilidade_profissional;
create policy "staff_gerencia_propria_disponibilidade" on disponibilidade_profissional
  for all using (profissional_id = public.meu_profissional_id())
  with check (profissional_id = public.meu_profissional_id());

drop policy if exists "owner_gerencia_disponibilidade" on disponibilidade_profissional;
create policy "owner_gerencia_disponibilidade" on disponibilidade_profissional
  for all using (public.eh_owner()) with check (public.eh_owner());

-- ---- bloqueios_agenda ----
drop policy if exists "staff_gerencia_proprios_bloqueios" on bloqueios_agenda;
create policy "staff_gerencia_proprios_bloqueios" on bloqueios_agenda
  for all using (profissional_id = public.meu_profissional_id())
  with check (profissional_id = public.meu_profissional_id());

drop policy if exists "owner_gerencia_bloqueios" on bloqueios_agenda;
create policy "owner_gerencia_bloqueios" on bloqueios_agenda
  for all using (public.eh_owner()) with check (public.eh_owner());

-- ---- servicos ----
drop policy if exists "leitura_publica_servicos_ativos" on servicos;
create policy "leitura_publica_servicos_ativos" on servicos
  for select using (ativo = true);

-- `for all` inclui SELECT: o owner precisa enxergar serviço desativado no
-- painel pra poder reativar.
drop policy if exists "owner_gerencia_servicos" on servicos;
create policy "owner_gerencia_servicos" on servicos
  for all using (public.eh_owner()) with check (public.eh_owner());

-- ---- profissional_servicos ----
drop policy if exists "leitura_publica_profissional_servicos" on profissional_servicos;
create policy "leitura_publica_profissional_servicos" on profissional_servicos
  for select using (true);

drop policy if exists "owner_gerencia_profissional_servicos" on profissional_servicos;
create policy "owner_gerencia_profissional_servicos" on profissional_servicos
  for all using (public.eh_owner()) with check (public.eh_owner());

-- ---- clientes ----
drop policy if exists "cliente_le_proprio_registro" on clientes;
create policy "cliente_le_proprio_registro" on clientes
  for select using (user_id = auth.uid());

drop policy if exists "cliente_atualiza_proprio_registro" on clientes;
create policy "cliente_atualiza_proprio_registro" on clientes
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Pré-cadastro NÃO tem policy de insert anônimo. O formulário público chama
-- a Edge Function `pre-cadastro` (supabase/functions/pre-cadastro), que
-- valida o payload, aplica rate limit por IP e por telefone (tabela
-- pre_cadastro_tentativas, seção 3 acima) e só então insere usando a
-- service role — que ignora RLS. Nenhum client anônimo escreve direto na
-- tabela clientes.

drop policy if exists "staff_le_proprios_clientes" on clientes;
create policy "staff_le_proprios_clientes" on clientes
  for select using (public.staff_atende_cliente(id));

drop policy if exists "owner_acesso_total_clientes" on clientes;
create policy "owner_acesso_total_clientes" on clientes
  for all using (public.eh_owner()) with check (public.eh_owner());

-- A cliente pode editar nome/endereço/nascimento/consentimento, mas não
-- o próprio whatsapp nem o user_id: whatsapp é a chave que liga o registro
-- ao login e é pra onde vão os lembretes. Trocar isso é coisa do owner.
-- Também carimba consentimento_em no banco sempre que o consentimento é
-- dado, em vez de confiar no horário mandado pelo client.
create or replace function public.protege_campos_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.eh_owner() then
    if new.whatsapp is distinct from old.whatsapp or new.user_id is distinct from old.user_id then
      raise exception 'whatsapp e vínculo de login só podem ser alterados pelo studio';
    end if;
  end if;

  if new.consentimento and (tg_op = 'INSERT' or not old.consentimento) then
    new.consentimento_em := now();
  end if;

  return new;
end;
$$;

drop trigger if exists clientes_protege_campos on clientes;
create trigger clientes_protege_campos
  before insert or update on clientes
  for each row execute function public.protege_campos_cliente();

-- ---- agendamentos ----
drop policy if exists "cliente_le_proprios_agendamentos" on agendamentos;
create policy "cliente_le_proprios_agendamentos" on agendamentos
  for select using (cliente_id = public.meu_cliente_id());

-- Validação de horário (cabe na disponibilidade, não cai em bloqueio,
-- duração bate com o serviço) é feita pelo trigger valida_agendamento
-- (migration 20260925170000), não aqui — a policy só garante que a cliente
-- não cria agendamento em nome de outra, nem já "concluído".
drop policy if exists "cliente_cria_proprio_agendamento" on agendamentos;
create policy "cliente_cria_proprio_agendamento" on agendamentos
  for insert with check (
    cliente_id = public.meu_cliente_id()
    and status = 'confirmado'
    and canal = 'app'
  );

drop policy if exists "cliente_remarca_proprio_agendamento" on agendamentos;
create policy "cliente_remarca_proprio_agendamento" on agendamentos
  for update using (
    cliente_id = public.meu_cliente_id()
    and status = 'confirmado'
    and lower(periodo) > now() + public.horas_minimas_remarcacao()
  )
  with check (
    -- sem isso, o Postgres reaproveitaria o USING como check; aqui a linha
    -- nova precisa continuar sendo da própria cliente e, se ainda estiver
    -- confirmada, respeitar a janela mínima de remarcação. O trigger abaixo
    -- cobre quais colunas podem mudar.
    cliente_id = public.meu_cliente_id()
    and (status = 'cancelado' or lower(periodo) > now() + public.horas_minimas_remarcacao())
  );

drop policy if exists "staff_gerencia_proprios_agendamentos" on agendamentos;
create policy "staff_gerencia_proprios_agendamentos" on agendamentos
  for all using (profissional_id = public.meu_profissional_id())
  with check (profissional_id = public.meu_profissional_id());

drop policy if exists "owner_acesso_total_agendamentos" on agendamentos;
create policy "owner_acesso_total_agendamentos" on agendamentos
  for all using (public.eh_owner()) with check (public.eh_owner());

-- IDOR/escalação: sem isso, a policy de remarcação da cliente (acima) deixava
-- trocar status, profissional_id, servico_id ou cliente_id livremente, porque
-- USING/WITH CHECK só enxergam a linha nova, não comparam com a antiga. Quem
-- não é staff dono do agendamento nem owner só pode mexer em periodo/
-- observacoes, e a única mudança de status permitida é confirmado ->
-- cancelado (botão "Cancelar" da seção 7). O resto (marcar no_show/concluido,
-- reatribuir profissional) continua exclusivo de staff/owner.
create or replace function public.protege_campos_agendamento_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or public.eh_owner()
    or old.profissional_id = public.meu_profissional_id()
  then
    return new;
  end if;

  if new.cliente_id is distinct from old.cliente_id
     or new.profissional_id is distinct from old.profissional_id
     or new.servico_id is distinct from old.servico_id
     or new.canal is distinct from old.canal
  then
    raise exception 'cliente só pode alterar periodo/observacoes do próprio agendamento';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'confirmado' and new.status = 'cancelado')
  then
    raise exception 'cliente só pode cancelar o próprio agendamento';
  end if;

  if new.status = 'cancelado' and new.periodo is distinct from old.periodo then
    raise exception 'cancelamento não pode mudar o horário';
  end if;

  return new;
end;
$$;

drop trigger if exists agendamentos_protege_campos_cliente on agendamentos;
create trigger agendamentos_protege_campos_cliente
  before update on agendamentos
  for each row execute function public.protege_campos_agendamento_cliente();

-- ---- lembretes_enviados ----
-- ninguém autenticado via app lê ou escreve aqui; só as Edge Functions
-- (service role, que ignora RLS) e o owner, pra depuração.
drop policy if exists "owner_le_lembretes" on lembretes_enviados;
create policy "owner_le_lembretes" on lembretes_enviados
  for select using (public.eh_owner());

-- =============================================================
-- 6. Storage — buckets de foto (seção 12)
-- =============================================================
-- bucket público (fotos aparecem no site/app sem exigir signed URL), com
-- allow-list de mime type e limite de 5 MB como primeira barreira. Isso
-- filtra pelo Content-Type que o cliente DECLARA no upload — não é a
-- garantia de magic bytes que a seção 12 pede, só a primeira camada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos',
  'fotos',
  true,
  5242880, -- 5 MB, fixo em código conforme decisão do dono do produto
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- caminho esperado: servicos/{servico_id}/arquivo.webp | profissionais/{profissional_id}/arquivo.webp
drop policy if exists "leitura_publica_fotos" on storage.objects;
create policy "leitura_publica_fotos" on storage.objects
  for select using (bucket_id = 'fotos');

drop policy if exists "owner_upload_fotos" on storage.objects;
create policy "owner_upload_fotos" on storage.objects
  for insert with check (bucket_id = 'fotos' and public.eh_owner());

drop policy if exists "owner_atualiza_fotos" on storage.objects;
create policy "owner_atualiza_fotos" on storage.objects
  for update using (bucket_id = 'fotos' and public.eh_owner());

drop policy if exists "owner_apaga_fotos" on storage.objects;
create policy "owner_apaga_fotos" on storage.objects
  for delete using (bucket_id = 'fotos' and public.eh_owner());

drop policy if exists "staff_upload_propria_foto" on storage.objects;
create policy "staff_upload_propria_foto" on storage.objects
  for insert with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = 'profissionais'
    and (storage.foldername(name))[2] = public.meu_profissional_id()::text
  );

drop policy if exists "staff_atualiza_propria_foto" on storage.objects;
create policy "staff_atualiza_propria_foto" on storage.objects
  for update using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = 'profissionais'
    and (storage.foldername(name))[2] = public.meu_profissional_id()::text
  );

drop policy if exists "staff_apaga_propria_foto" on storage.objects;
create policy "staff_apaga_propria_foto" on storage.objects
  for delete using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = 'profissionais'
    and (storage.foldername(name))[2] = public.meu_profissional_id()::text
  );

-- =============================================================
-- 7. Validação real de magic bytes (seção 12: "rejeitar por magic bytes,
--    não por extensão")
-- =============================================================
-- allowed_mime_types do bucket só filtra o Content-Type declarado pelo
-- cliente, que é falsificável. A garantia de verdade fica na Edge Function
-- `validar-foto` (Fase 1, ver supabase/functions/validar-foto), que lê os
-- primeiros bytes do arquivo já salvo e apaga do bucket qualquer objeto cujo
-- conteúdo real não bata com um magic number de JPEG/PNG/WEBP.
--
-- O POST sai por dispara_webhook() (abaixo), que chama pg_net direto. Não
-- usa supabase_functions.http_request (a função por trás dos "Database
-- Webhooks" do dashboard): esse schema só existe em projeto onde a
-- integração de webhooks foi ativada pela tela, e aqui tudo roda por SQL.
-- O corpo enviado é o mesmo formato dos Database Webhooks
-- ({type, table, schema, record, old_record}), que é o que as Edge
-- Functions leem. O envio é assíncrono: sai depois do commit e, se falhar,
-- não desfaz o insert que o disparou.
--
-- A validar-foto roda com a verificação de JWT desligada, porque quem chama
-- é o Postgres, não um usuário logado. Em vez disso, o header
-- x-webhook-secret autentica a chamada: só passa quem sabe o segredo, que a
-- própria função confere contra a env var WEBHOOK_VALIDAR_FOTO_SECRET.
create or replace function public.dispara_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- tg_argv[0] = URL da Edge Function, tg_argv[1] = secret do header
  perform net.http_post(
    url := tg_argv[0],
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', tg_argv[1]),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

--
-- ANTES DE RODAR ESTA MIGRATION: gere um valor você mesmo (ex: no seu
-- terminal, `openssl rand -hex 32`), troque '<COLE_O_SECRET_AQUI>' abaixo por
-- esse valor, e configure o MESMO valor na função com:
--   supabase secrets set WEBHOOK_VALIDAR_FOTO_SECRET=<mesmo valor>
-- Não reaproveite nenhum token/chave que já existe no projeto — este é um
-- segredo novo, só para autenticar este webhook interno.
drop trigger if exists on_foto_uploaded on storage.objects;
create trigger on_foto_uploaded
  after insert on storage.objects
  for each row
  when (new.bucket_id = 'fotos')
  execute function public.dispara_webhook(
    'https://pjbcgyzykvidbwdjlnvp.supabase.co/functions/v1/validar-foto',
    '<COLE_O_SECRET_AQUI>'
  );

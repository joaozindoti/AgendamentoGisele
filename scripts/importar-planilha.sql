-- Importa as clientes da planilha "CRM Studio Gisele Lima" (seção 11) sem
-- terminal. Antes: a tabela public.planilha_importada é criada pelo arquivo
-- de preparação (scripts/preparar-planilha.sql) e o CSV da aba "Página1" é
-- importado pra dentro dela pelo Table Editor. Este script normaliza e copia
-- pra `clientes`, mostra o relatório e apaga a tabela temporária no fim
-- (dado pessoal não fica sobrando no banco). Mesma regra do app:
--   - telefone: só dígitos; 55 na frente só é removido se sobrar número
--     demais; precisa dar DDD + 8/9 dígitos -> +55DDDNUMERO
--   - data: aceita AAAA-MM-DD, DD/MM/AAAA e DD-MM-AAAA
--   - consentimento = false (decisão de 25/09/2026)
--   - WhatsApp já cadastrado: atualiza nome e completa endereço/nascimento
--     vazios, não duplica
--   - ficam de fora (e aparecem no relatório): linha sem nome, telefone
--     inválido, linha de teste (nome "Teste") e cliente marcada na coluna
--     "bloqueado" da planilha — o sistema novo não tem bloqueio; quem estiver
--     ali é decidido à mão depois
-- Colunas aceitas (maiúscula/acento/espaço sobrando não importam):
-- nome|cliente, whatsapp|telefone|celular|numero|fone, endereco,
-- data_nascimento|nascimento|aniversario|data de nascimento, bloqueado.
--
-- Pode rodar de novo (depois de importar o CSV outra vez): não duplica nada.

drop table if exists pg_temp._linhas, pg_temp._normalizadas, pg_temp._relatorio;

create or replace function pg_temp.sem_acento(t text) returns text language sql immutable as $$
  select translate(lower(trim(t)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
$$;

create or replace function pg_temp.le_data(t text) returns date language plpgsql immutable as $$
begin
  t := trim(t);
  if t ~ '^\d{4}-\d{2}-\d{2}' then return left(t, 10)::date; end if;
  if t ~ '^\d{1,2}[/-]\d{1,2}[/-]\d{4}$' then return to_date(replace(t, '-', '/'), 'DD/MM/YYYY'); end if;
  return null;
exception when others then
  return null; -- ex: 31/02/1990
end;
$$;

create or replace function pg_temp.le_telefone(t text) returns text language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(t, ''), '\D', '', 'g');
begin
  if length(d) > 11 and left(d, 2) = '55' then d := substr(d, 3); end if;
  if length(d) in (10, 11) then return '+55' || d; end if;
  return null;
end;
$$;

do $$
declare
  cols text[];
  c_nome text;
  c_tel text;
  c_end text;
  c_nasc text;
  c_bloq text;
  achar text;
  opcional text := 'nullif(trim(%I::text), %L)';
begin
  if to_regclass('public.planilha_importada') is null then
    raise exception 'Tabela public.planilha_importada não existe. Rode o arquivo de preparação e importe o CSV nela (passo 8 do PENDENCIAS.md).';
  end if;

  select array_agg(column_name::text order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'planilha_importada';

  achar := 'select c from unnest($1) c where pg_temp.sem_acento(c) = any($2) limit 1';
  execute achar into c_nome using cols, array['nome', 'cliente'];
  execute achar into c_tel using cols, array['whatsapp', 'telefone', 'celular', 'numero', 'fone'];
  execute achar into c_end using cols, array['endereco'];
  execute achar into c_nasc using cols, array['data_nascimento', 'nascimento', 'aniversario', 'data de nascimento'];
  execute achar into c_bloq using cols, array['bloqueado', 'bloqueada'];

  if c_nome is null or c_tel is null then
    raise exception 'Não achei coluna de nome e/ou WhatsApp. Colunas da tabela: %', array_to_string(cols, ', ');
  end if;

  execute format($f$
    create temp table _linhas as
    select row_number() over () + 1 as linha,
           nullif(trim(%1$I::text), '') as nome,
           %2$I::text as telefone_bruto,
           %3$s as endereco,
           %4$s as nascimento_bruto,
           %5$s as bloqueado
    from public.planilha_importada
  $f$,
    c_nome,
    c_tel,
    case when c_end is null then 'null::text' else format(opcional, c_end, '') end,
    case when c_nasc is null then 'null::text' else format(opcional, c_nasc, '') end,
    case when c_bloq is null then 'null::text' else format(opcional, c_bloq, '') end);
end;
$$;

create temp table _normalizadas as
select linha, nome, telefone_bruto, endereco, nascimento_bruto, bloqueado,
       pg_temp.le_telefone(telefone_bruto) as whatsapp,
       pg_temp.le_data(nascimento_bruto) as data_nascimento,
       case
         when nome is null then 'sem nome — ficou de fora'
         when pg_temp.sem_acento(nome) = 'teste' then 'linha de teste — ficou de fora'
         when bloqueado is not null then format('marcada como bloqueada na planilha ("%s") — ficou de fora; cadastre à mão se quiser', bloqueado)
         when pg_temp.le_telefone(telefone_bruto) is null then format('telefone "%s" inválido — ficou de fora', telefone_bruto)
       end as fora
from _linhas;

create temp table _relatorio as
select linha, coalesce(nome, '(sem nome)') as nome, motivo
from (
  select linha, nome, fora as motivo from _normalizadas where fora is not null
  union all
  select linha, nome, format('data de nascimento "%s" não reconhecida — importada sem data', nascimento_bruto)
  from _normalizadas where fora is null and nascimento_bruto is not null and data_nascimento is null
  union all
  select linha, nome, format('WhatsApp %s repetido na planilha — valeu a última linha', whatsapp)
  from (
    select *, count(*) over (partition by whatsapp) as n, max(linha) over (partition by whatsapp) as ultima
    from _normalizadas where fora is null
  ) x where n > 1 and linha <> ultima
  union all
  select 1, '(planilha vazia)', 'a tabela planilha_importada não tinha nenhuma linha — o CSV não chegou a ser importado nela'
  where not exists (select 1 from _linhas)
) r;

with validas as (
  select distinct on (whatsapp) nome, whatsapp, endereco, data_nascimento
  from _normalizadas
  where fora is null
  order by whatsapp, linha desc
),
gravadas as (
  insert into clientes (nome, whatsapp, endereco, data_nascimento, consentimento)
  select nome, whatsapp, endereco, data_nascimento, false from validas
  on conflict (whatsapp) do update set
    nome = excluded.nome,
    endereco = coalesce(clientes.endereco, excluded.endereco),
    data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento)
  returning (xmax = 0) as nova
)
insert into _relatorio (linha, nome, motivo)
select 0, 'RESUMO', format('%s clientes novas, %s já existiam (atualizadas), %s avisos abaixo',
  count(*) filter (where nova), count(*) filter (where not nova), (select count(*) from _relatorio))
from gravadas;

-- a cópia da planilha já cumpriu o papel: não deixa dado pessoal sobrando
drop table public.planilha_importada;

select linha, nome, motivo from _relatorio order by linha;

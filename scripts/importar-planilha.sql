-- Importa as clientes da planilha "CRM Studio Gisele Lima" (seção 11) sem
-- terminal: o CSV da aba "Página1" é carregado no Table Editor como a
-- tabela public.planilha_importada, e este script normaliza e copia pra
-- `clientes`. Mesma regra do scripts/migrar-planilha.mjs e do app:
--   - telefone: só dígitos; 55 na frente só é removido se sobrar número
--     demais; precisa dar DDD + 8/9 dígitos -> +55DDDNUMERO
--   - data: aceita AAAA-MM-DD, DD/MM/AAAA e DD-MM-AAAA
--   - consentimento = false (decisão de 25/09/2026)
--   - WhatsApp já cadastrado: atualiza nome e completa endereço/nascimento
--     vazios, não duplica
-- Colunas aceitas (maiúscula/acento não importam): nome|cliente,
-- whatsapp|telefone|celular|numero|fone, endereco, data_nascimento|
-- nascimento|aniversario|data de nascimento.
--
-- O resultado mostra cada linha que ficou de fora e o motivo, e um resumo.

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
  achar text;
begin
  if to_regclass('public.planilha_importada') is null then
    raise exception 'Tabela public.planilha_importada não existe. Importe o CSV pelo Table Editor com esse nome (passo 8 do PENDENCIAS.md).';
  end if;

  select array_agg(column_name::text order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'planilha_importada';

  achar := 'select c from unnest($1) c where pg_temp.sem_acento(c) = any($2) limit 1';
  execute achar into c_nome using cols, array['nome', 'cliente'];
  execute achar into c_tel using cols, array['whatsapp', 'telefone', 'celular', 'numero', 'fone'];
  execute achar into c_end using cols, array['endereco'];
  execute achar into c_nasc using cols, array['data_nascimento', 'nascimento', 'aniversario', 'data de nascimento'];

  if c_nome is null or c_tel is null then
    raise exception 'Não achei coluna de nome e/ou WhatsApp. Colunas da tabela: %', array_to_string(cols, ', ');
  end if;

  execute format($f$
    create temp table _linhas as
    select row_number() over () + 1 as linha,
           nullif(trim(%1$I::text), '') as nome,
           %2$I::text as telefone_bruto,
           %3$s as endereco,
           %4$s as nascimento_bruto
    from public.planilha_importada
  $f$,
    c_nome,
    c_tel,
    case when c_end is null then 'null::text' else format('nullif(trim(%I::text), %L)', c_end, '') end,
    case when c_nasc is null then 'null::text' else format('nullif(trim(%I::text), %L)', c_nasc, '') end);
end;
$$;

create temp table _normalizadas as
select linha, nome, telefone_bruto, endereco, nascimento_bruto,
       pg_temp.le_telefone(telefone_bruto) as whatsapp,
       pg_temp.le_data(nascimento_bruto) as data_nascimento
from _linhas;

create temp table _relatorio as
select linha, coalesce(nome, '(sem nome)') as nome, motivo
from (
  select linha, nome, 'sem nome — ficou de fora' as motivo from _normalizadas where nome is null
  union all
  select linha, nome, format('telefone "%s" inválido — ficou de fora', telefone_bruto)
  from _normalizadas where nome is not null and whatsapp is null
  union all
  select linha, nome, format('data de nascimento "%s" não reconhecida — importada sem data', nascimento_bruto)
  from _normalizadas where nome is not null and whatsapp is not null and nascimento_bruto is not null and data_nascimento is null
  union all
  select linha, nome, format('WhatsApp %s repetido na planilha — valeu a última linha', whatsapp)
  from (
    select *, count(*) over (partition by whatsapp) as n, max(linha) over (partition by whatsapp) as ultima
    from _normalizadas where nome is not null and whatsapp is not null
  ) x where n > 1 and linha <> ultima
) r;

with validas as (
  select distinct on (whatsapp) nome, whatsapp, endereco, data_nascimento
  from _normalizadas
  where nome is not null and whatsapp is not null
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

select linha, nome, motivo from _relatorio order by linha;

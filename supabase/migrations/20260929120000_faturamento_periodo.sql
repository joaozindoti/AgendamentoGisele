-- Faturamento do studio por profissional — só owner.
--
-- Não precisa de coluna nova: o valor de cada atendimento é o mesmo preço
-- efetivo que o catálogo e as métricas usam, preco_override da profissional
-- ou, sem ele, servicos.preco. Serviço sem preço ("consulte o valor") entra
-- como 0 na soma e é contado em `sem_preco`, pra tela avisar.
--
-- Uma linha por profissional (ativas, mesmo zeradas, e inativas que tenham
-- faturado no período) e uma última linha de total geral com
-- profissional_id = null. Só conta status = 'concluido'; o dia é o do início
-- do atendimento no fuso do studio, como em metricas().
--
-- Idempotente: pode rodar de novo sem erro.

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
      select a.profissional_id as prof,
             coalesce(ps.preco_override, s.preco) as preco
      from agendamentos a
      join servicos s on s.id = a.servico_id
      left join profissional_servicos ps
        on ps.profissional_id = a.profissional_id and ps.servico_id = a.servico_id
      where a.status = 'concluido'
        and (lower(a.periodo) at time zone 'America/Fortaleza')::date between data_inicio and data_fim
    ),
    por_prof as (
      select p.id, p.nome, p.papel,
             count(c.prof) as n,
             count(c.prof) filter (where c.preco is null) as n_sem_preco,
             coalesce(sum(c.preco), 0)::numeric as soma
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

-- Funções novas em `public` nascem com EXECUTE pra PUBLIC: fecha e libera só
-- pra logado; a checagem de owner é por dentro (staff e cliente recebem
-- 'apenas_owner'), mesmo padrão de metricas() e profissionais_admin().
revoke all on function public.faturamento_periodo(date, date) from public, anon, authenticated;
grant execute on function public.faturamento_periodo(date, date) to authenticated;
